import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";
import {
  Comision,
  Entrega,
  Grupo,
  GrupalAssignment,
  INTEGRANTES_ALUMNOS,
  INTEGRANTES_DOCENTES,
  NOMBRES_ESTADO_DE_PROVISION,
} from "../../src/domain/entities";

// Los metadatos y el snapshot no prueban la hidratación: acá se persisten y
// recargan entidades con la base real para confirmar que las columnas string
// (`tipo_integrantes`, `provision_estado`) vuelven como objetos de dominio
// (`TipoDeIntegrantes`, `EstadoDeProvision`) y que en la base siguen siendo
// el string de siempre.

function getSafeTestDatabaseUrl(): string {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "MIGRATION_TEST_DATABASE_URL es obligatoria para ejecutar pruebas de migraciones"
    );
  }

  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("La base de migraciones debe usar PostgreSQL");
  }
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `La base de migraciones debe terminar en _test; se recibió ${databaseName || "una base sin nombre"}`
    );
  }

  return value;
}

async function resetPublicSchema(orm: MikroORM): Promise<void> {
  const connection = orm.em.getConnection();
  await connection.execute('drop schema if exists "public" cascade');
  await connection.execute('create schema "public"');
}

describe("hidratación de TipoDeIntegrantes y EstadoDeProvision", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig,
      clientUrl: getSafeTestDatabaseUrl(),
      debug: false,
      migrations: {
        ...ormConfig.migrations,
        snapshot: false,
      },
    });
    await resetPublicSchema(orm);
    await orm.getMigrator().up();
  });

  afterAll(async () => {
    if (!orm) return;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it("recarga el tipo de integrantes de cada grupo como la instancia única de dominio", async () => {
    const em = orm.em.fork();
    const comision = new Comision(2026, `sheet-${randomUUID()}`);
    const assignment = new GrupalAssignment();
    assignment.titulo = "TP grupal hidratación";
    assignment.slug = `tp-${randomUUID()}`;
    assignment.templateRepo = "org/template";
    assignment.paradigma = "funcional";
    assignment.tipo = "grupal";
    assignment.maxIntegrantes = 3;
    assignment.comision = comision;
    const grupoDeAlumnos = assignment.crearGrupo("Alumnos", "ana", INTEGRANTES_ALUMNOS);
    const grupoDeDocentes = assignment.crearGrupo("Docentes", "profe", INTEGRANTES_DOCENTES);
    em.persist([comision, assignment, grupoDeAlumnos, grupoDeDocentes]);
    await em.flush();

    const recargado = orm.em.fork();
    const alumnos = await recargado.findOneOrFail(Grupo, { id: grupoDeAlumnos.id });
    const docentes = await recargado.findOneOrFail(Grupo, { id: grupoDeDocentes.id });

    expect(alumnos.tipoDeIntegrantesNombre).toBe("alumnos");
    expect(alumnos.tipoDeIntegrantes).toBe(INTEGRANTES_ALUMNOS);
    expect(docentes.tipoDeIntegrantesNombre).toBe("docentes");
    expect(docentes.tipoDeIntegrantes).toBe(INTEGRANTES_DOCENTES);

    const filas = await orm.em.getConnection().execute<{ id: string; tipo_integrantes: string }[]>(
      `select "id", "tipo_integrantes" from "grupo" where "id" in (?, ?)`,
      [grupoDeAlumnos.id, grupoDeDocentes.id]
    );
    const tipoPorId = new Map(filas.map((fila) => [fila.id, fila.tipo_integrantes]));
    expect(tipoPorId.get(grupoDeAlumnos.id)).toBe("alumnos");
    expect(tipoPorId.get(grupoDeDocentes.id)).toBe("docentes");
  });

  it("recarga el estado de provisión de cada entrega como la instancia de dominio", async () => {
    const em = orm.em.fork();
    const comision = new Comision(2026, `sheet-${randomUUID()}`);
    const assignment = new GrupalAssignment();
    assignment.titulo = "TP provisión hidratación";
    assignment.slug = `tp-${randomUUID()}`;
    assignment.templateRepo = "org/template";
    assignment.paradigma = "funcional";
    assignment.tipo = "grupal";
    assignment.maxIntegrantes = 3;
    assignment.comision = comision;
    em.persist([comision, assignment]);

    const idPorEstado = new Map<string, string>();
    for (const nombre of NOMBRES_ESTADO_DE_PROVISION) {
      const entrega = new Entrega();
      entrega.assignment = assignment;
      entrega.githubUsernames = [`usuario-${nombre}-${randomUUID()}`];
      entrega.provisionEstado = nombre;
      em.persist(entrega);
      idPorEstado.set(nombre, entrega.id);
    }
    await em.flush();

    const recargado = orm.em.fork();
    for (const nombre of NOMBRES_ESTADO_DE_PROVISION) {
      const entrega = await recargado.findOneOrFail(Entrega, { id: idPorEstado.get(nombre) });
      expect(entrega.provisionEstado).toBe(nombre);
      expect(entrega.estadoDeProvision.nombre).toBe(nombre);
    }
  });
});
