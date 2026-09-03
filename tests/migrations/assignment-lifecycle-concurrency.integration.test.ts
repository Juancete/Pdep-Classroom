import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const ormHolder = vi.hoisted(() => ({ orm: undefined as MikroORM | undefined }));

vi.mock("@/infrastructure/db", () => ({
  getEM: async () => {
    if (!ormHolder.orm) throw new Error("ORM de integración no inicializado");
    return ormHolder.orm.em.fork();
  },
}));

import { cambiarEstadoAssignment } from "../../src/infrastructure/repositories/AssignmentRepository";
import { crearEntregaSiAssignmentDisponible } from "../../src/infrastructure/repositories/EntregaRepository";
import { TransicionDeEstadoInvalidaError, ESTUDIANTE } from "../../src/domain/entities";
import { AssignmentNoDisponibleError } from "../../src/application/assignmentAuthorization";

const LIFECYCLE_MIGRATION = "Migration20260814180000_assignment_lifecycle";

function getSafeTestDatabaseUrl(): string {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "MIGRATION_TEST_DATABASE_URL es obligatoria para ejecutar pruebas de migraciones"
    );
  }
  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error("La base de migraciones debe terminar en _test");
  }
  return value;
}

async function resetPublicSchema(orm: MikroORM): Promise<void> {
  const connection = orm.em.getConnection();
  await connection.execute('drop schema if exists "public" cascade');
  await connection.execute('create schema "public"');
}

async function seedAssignmentPublicado(
  orm: MikroORM
): Promise<{ assignmentId: string; comisionId: string }> {
  const connection = orm.em.getConnection();
  const comisionId = randomUUID();
  const assignmentId = randomUUID();

  await connection.execute(
    `insert into "comision"
      ("id", "anio", "spreadsheet_id", "activa", "column_config")
     values (?, 2026, ?, false, '{}'::jsonb)`,
    [comisionId, `sheet-${comisionId}`]
  );
  await connection.execute(
    `insert into "assignment"
      ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
       "created_at", "comision_id", "inscripciones_cerradas", "estado_nombre",
       "publicado_en", "publicado_por")
     values (?, 'TP concurrente', ?, 'org/template', 'funcional', 'individual',
       now(), ?, false, 'publicado', now(), 'docente1')`,
    [assignmentId, `tp-${assignmentId}`, comisionId]
  );

  return { assignmentId, comisionId };
}

describe("carrera entre despublicar y aceptar un assignment", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig,
      clientUrl: getSafeTestDatabaseUrl(),
      debug: false,
      migrations: { ...ormConfig.migrations, snapshot: false },
    });
    await resetPublicSchema(orm);
    await orm.getMigrator().up({ to: LIFECYCLE_MIGRATION });
    ormHolder.orm = orm;
  });

  afterAll(async () => {
    if (!orm) return;
    ormHolder.orm = undefined;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it(
    "nunca deja el assignment en borrador con una entrega creada concurrentemente",
    async () => {
      const { assignmentId } = await seedAssignmentPublicado(orm);

      const [despublicar, aceptar] = await Promise.allSettled([
        cambiarEstadoAssignment(assignmentId, "borrador", "docente1"),
        crearEntregaSiAssignmentDisponible(
          {
            assignmentId,
            repoName: `tp-concurrente-alumno`,
            repoUrl: "https://github.com/org/tp-concurrente-alumno",
            githubUsernames: ["alumno1"],
          },
          ESTUDIANTE
        ),
      ]);

      // El lock pesimista compartido serializa ambas operaciones: una de las
      // dos ve el estado real que dejó la otra y actúa en consecuencia. No
      // importa cuál gana la carrera — lo que no puede pasar es que el
      // assignment quede en borrador con una entrega persistida.
      const connection = orm.em.getConnection();
      const rows = await connection.execute<{ estado_nombre: string }[]>(
        `select "estado_nombre" from "assignment" where "id" = ?`,
        [assignmentId]
      );
      const entregas = await connection.execute<{ count: string }[]>(
        `select count(*) from "entrega" where "assignment_id" = ?`,
        [assignmentId]
      );
      const estadoFinal = rows[0]!.estado_nombre;
      const tieneEntregas = Number(entregas[0]!.count) > 0;

      expect(!(estadoFinal === "borrador" && tieneEntregas)).toBe(true);

      if (estadoFinal === "borrador") {
        // Despublicar ganó el lock primero: no había entregas todavía, y el
        // accept que llegó después vio el assignment ya en borrador.
        expect(despublicar.status).toBe("fulfilled");
        expect(aceptar.status).toBe("rejected");
        if (aceptar.status === "rejected") {
          expect(aceptar.reason).toBeInstanceOf(AssignmentNoDisponibleError);
        }
        expect(tieneEntregas).toBe(false);
      } else {
        // Aceptar ganó el lock primero: la entrega ya existía cuando
        // despublicar recontó entregas dentro de su propia transacción.
        expect(aceptar.status).toBe("fulfilled");
        expect(despublicar.status).toBe("rejected");
        if (despublicar.status === "rejected") {
          expect(despublicar.reason).toBeInstanceOf(TransicionDeEstadoInvalidaError);
        }
        expect(tieneEntregas).toBe(true);
      }
    },
    15_000
  );
});
