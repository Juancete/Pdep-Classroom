import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const ormHolder = vi.hoisted(() => ({ orm: undefined as MikroORM | undefined }));

vi.mock("@/infrastructure/db", () => ({
  getEM: async () => {
    if (!ormHolder.orm) throw new Error("ORM de integración no inicializado");
    return ormHolder.orm.em.fork();
  },
}));

import {
  DOCENTE,
  GrupoLlenoError,
  GrupoConEntregaError,
  InscripcionesCerradasError,
  Alumno,
  ParticipanteAlumno,
  type ActorDeMembresia,
} from "../../src/domain/entities";
import {
  crearGrupo,
  salirDeGrupo,
  moverAlumnoDeGrupo,
} from "../../src/infrastructure/repositories/GrupoRepository";
import { crearEntregaSiAssignmentDisponible } from "../../src/infrastructure/repositories/EntregaRepository";

// Estos tests ejercitan las invariantes de membresía en Postgres, no GitHub.
const accesoSinGithub = {
  otorgarA: async () => {},
  revocarA: async () => {},
};

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

// `salirDeGrupo`/`moverAlumnoDeGrupo`/`crearGrupo` piden quién actúa como
// `Participante` (self-service) o `ActorDeMembresia` (issue #107/#112) — se
// construyen acá desde el `Alumno` real recién sembrado, o desde el bypass
// administrativo del docente cuando administra la membresía de otro.
async function participanteDeAlumno(orm: MikroORM, alumnoId: string): Promise<ParticipanteAlumno> {
  const em = orm.em.fork();
  const alumno = await em.findOneOrFail(Alumno, { id: alumnoId }, { populate: ["comision"] });
  return new ParticipanteAlumno(alumno, alumno.githubUsername);
}

function actorDocente(assignmentId: string): ActorDeMembresia {
  return DOCENTE.actorSobreMembresiaAjena(assignmentId);
}

type Seed = {
  comisionId: string;
  assignmentId: string;
  alumnoIds: string[];
  githubUsernames: string[];
  grupoIds: string[];
};

// A diferencia de group-membership-invariants.integration.test.ts, acá se
// migra hasta el final (sin `to:`) — no hace falta reconstruir el schema
// paso a paso porque estas pruebas no ejercitan las migraciones en sí, sino
// las operaciones de membresía ya con el schema completo.
async function seedGroups(
  orm: MikroORM,
  options: { alumnos: number; grupos: number; maxIntegrantes: number }
): Promise<Seed> {
  const connection = orm.em.getConnection();
  const comisionId = randomUUID();
  const assignmentId = randomUUID();
  const alumnoIds = Array.from({ length: options.alumnos }, () => randomUUID());
  const githubUsernames = alumnoIds.map((alumnoId, index) => `alumno-${index}-${alumnoId}`);
  const grupoIds = Array.from({ length: options.grupos }, () => randomUUID());

  await connection.execute(
    `insert into "comision" ("id", "anio", "spreadsheet_id", "activa", "column_config")
     values (?, 2026, ?, false, '{}'::jsonb)`,
    [comisionId, `sheet-${comisionId}`]
  );
  await connection.execute(
    `insert into "assignment"
      ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
       "created_at", "comision_id", "max_integrantes", "inscripciones_cerradas",
       "estado_nombre")
     values (?, 'TP concurrente', ?, 'org/template', 'funcional', 'grupal',
       now(), ?, ?, false, 'publicado')`,
    [assignmentId, `tp-${assignmentId}`, comisionId, options.maxIntegrantes]
  );

  for (const [index, alumnoId] of alumnoIds.entries()) {
    // `registro_confirmado_en_id` = la misma comisión: issue #107, revisión
    // de code review — `ParticipanteAlumno` sólo participa con el registro
    // confirmado, no alcanza con tener `comision_id`.
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email", "comision_id", "registro_confirmado_en_id")
       values (?, ?, ?, 'Test', ?, ?, ?, ?)`,
      [
        alumnoId,
        `${1000 + index}`,
        `Alumno ${index}`,
        githubUsernames[index],
        `${githubUsernames[index]}@example.com`,
        comisionId,
        comisionId,
      ]
    );
  }

  for (const [index, grupoId] of grupoIds.entries()) {
    await connection.execute(
      `insert into "grupo"
        ("id", "nombre", "nombre_normalizado", "paradigma",
         "max_integrantes", "creado_por", "assignment_id")
       values (?, ?, ?, 'funcional', ?, 'test', ?)`,
      [grupoId, `Grupo ${index}`, `grupo-${index}`, options.maxIntegrantes, assignmentId]
    );
  }

  return { comisionId, assignmentId, alumnoIds, githubUsernames, grupoIds };
}

async function seedMembership(
  orm: MikroORM,
  grupoId: string,
  assignmentId: string,
  alumnoId: string,
  githubUsername: string
): Promise<void> {
  await orm.em.getConnection().execute(
    `insert into "grupo_miembro" ("id", "grupo_id", "assignment_id", "github_username", "alumno_id")
     values (?, ?, ?, ?, ?)`,
    [randomUUID(), grupoId, assignmentId, githubUsername, alumnoId]
  );
}

async function seedEntrega(
  orm: MikroORM,
  params: { assignmentId: string; grupoId: string }
): Promise<string> {
  const entregaId = randomUUID();
  await orm.em.getConnection().execute(
    `insert into "entrega"
      ("id", "assignment_id", "grupo_id", "github_usernames", "created_at")
     values (?, ?, ?, '{}'::text[], now())`,
    [entregaId, params.assignmentId, params.grupoId]
  );
  return entregaId;
}

describe.sequential("salir y cambiarse de grupo — invariantes concurrentes", () => {
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
    ormHolder.orm = orm;
  });

  afterAll(async () => {
    if (!orm) return;
    ormHolder.orm = undefined;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  beforeEach(async () => {
    await orm.em.getConnection().execute('truncate table "comision" cascade');
  });

  it("rechaza al alumno con inscripciones cerradas, pero permite al docente administrando a otro", async () => {
    const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
    await orm.em.getConnection().execute(
      `update "assignment" set "inscripciones_cerradas" = true where "id" = ?`,
      [seed.assignmentId]
    );

    await expect(
      salirDeGrupo({ acceso: accesoSinGithub,
        assignmentId: seed.assignmentId,
        grupoId: seed.grupoIds[0]!,
        githubUsername: seed.githubUsernames[0]!,
        actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        realizadoPor: seed.githubUsernames[0]!,
      })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);

    await expect(
      salirDeGrupo({ acceso: accesoSinGithub,
        assignmentId: seed.assignmentId,
        grupoId: seed.grupoIds[0]!,
        githubUsername: seed.githubUsernames[0]!,
        actor: actorDocente(seed.assignmentId),
        realizadoPor: "docente1",
      })
    ).resolves.toMatchObject({ grupoEliminado: true });
  });

  it("un cambio a un grupo lleno falla y el alumno conserva su grupo original", async () => {
    const seed = await seedGroups(orm, { alumnos: 2, grupos: 2, maxIntegrantes: 1 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
    await seedMembership(orm, seed.grupoIds[1]!, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);

    await expect(
      moverAlumnoDeGrupo({ acceso: accesoSinGithub,
        assignmentId: seed.assignmentId,
        grupoDestinoId: seed.grupoIds[1]!,
        githubUsername: seed.githubUsernames[0]!,
        actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        realizadoPor: seed.githubUsernames[0]!,
      })
    ).rejects.toBeInstanceOf(GrupoLlenoError);

    const rows = await orm.em.getConnection().execute<{ grupo_id: string }[]>(
      `select "grupo_id" from "grupo_miembro" where "alumno_id" = ?`,
      [seed.alumnoIds[0]]
    );
    expect(rows).toEqual([{ grupo_id: seed.grupoIds[0] }]);
  });

  it("rechaza al alumno si el grupo ya entregó; el docente puede y el grupo no se borra aunque quede vacío", async () => {
    const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
    await seedEntrega(orm, { assignmentId: seed.assignmentId, grupoId: seed.grupoIds[0]! });

    await expect(
      salirDeGrupo({ acceso: accesoSinGithub,
        assignmentId: seed.assignmentId,
        grupoId: seed.grupoIds[0]!,
        githubUsername: seed.githubUsernames[0]!,
        actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        realizadoPor: seed.githubUsernames[0]!,
      })
    ).rejects.toBeInstanceOf(GrupoConEntregaError);

    const resultado = await salirDeGrupo({ acceso: accesoSinGithub,
      assignmentId: seed.assignmentId,
      grupoId: seed.grupoIds[0]!,
      githubUsername: seed.githubUsernames[0]!,
      actor: actorDocente(seed.assignmentId),
      realizadoPor: "docente1",
    });
    expect(resultado.grupoEliminado).toBe(false);

    const grupoRows = await orm.em.getConnection().execute<{ id: string }[]>(
      `select "id" from "grupo" where "id" = ?`,
      [seed.grupoIds[0]]
    );
    expect(grupoRows).toHaveLength(1);
  });

  it("borra el grupo si el último integrante sale sin entrega, y libera su nombre normalizado", async () => {
    const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
    await orm.em.getConnection().execute(
      `update "grupo" set "nombre" = 'Los Lambdas', "nombre_normalizado" = 'los-lambdas' where "id" = ?`,
      [seed.grupoIds[0]]
    );
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);

    const resultado = await salirDeGrupo({ acceso: accesoSinGithub,
      assignmentId: seed.assignmentId,
      grupoId: seed.grupoIds[0]!,
      githubUsername: seed.githubUsernames[0]!,
      actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
      realizadoPor: seed.githubUsernames[0]!,
    });
    expect(resultado.grupoEliminado).toBe(true);

    const grupoRows = await orm.em.getConnection().execute<{ id: string }[]>(
      `select "id" from "grupo" where "id" = ?`,
      [seed.grupoIds[0]]
    );
    expect(grupoRows).toEqual([]);

    const nuevoGrupo = await crearGrupo({
      assignmentId: seed.assignmentId,
      nombre: "Los Lambdas",
      participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
    });
    expect(nuevoGrupo.nombreNormalizado).toBe("los-lambdas");
  });

  it("dos salidas simultáneas del mismo grupo de dos integrantes resuelven sin error y lo borran una sola vez", async () => {
    const seed = await seedGroups(orm, { alumnos: 2, grupos: 1, maxIntegrantes: 2 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);

    const results = await Promise.allSettled(
      [0, 1].map(async (index) =>
        salirDeGrupo({ acceso: accesoSinGithub,
          assignmentId: seed.assignmentId,
          grupoId: seed.grupoIds[0]!,
          githubUsername: seed.githubUsernames[index]!,
          actor: await participanteDeAlumno(orm, seed.alumnoIds[index]!),
          realizadoPor: seed.githubUsernames[index]!,
        })
      )
    );

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const grupoRows = await orm.em.getConnection().execute<{ id: string }[]>(
      `select "id" from "grupo" where "id" = ?`,
      [seed.grupoIds[0]]
    );
    expect(grupoRows).toEqual([]);
  });

  it("dos cambios simultáneos del mismo alumno a distintos grupos dejan una sola membresía final", async () => {
    const seed = await seedGroups(orm, { alumnos: 1, grupos: 3, maxIntegrantes: 3 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);

    const results = await Promise.allSettled(
      [seed.grupoIds[1]!, seed.grupoIds[2]!].map(async (grupoDestinoId) =>
        moverAlumnoDeGrupo({ acceso: accesoSinGithub,
          assignmentId: seed.assignmentId,
          grupoDestinoId,
          githubUsername: seed.githubUsernames[0]!,
          actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
          realizadoPor: seed.githubUsernames[0]!,
        })
      )
    );

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const memberships = await orm.em.getConnection().execute<{ count: string }[]>(
      `select count(*) from "grupo_miembro" where "assignment_id" = ? and "alumno_id" = ?`,
      [seed.assignmentId, seed.alumnoIds[0]]
    );
    expect(Number(memberships[0]?.count)).toBe(1);
  });

  it("dos alumnos compitiendo por el último cupo del destino: uno gana, el perdedor conserva su grupo", async () => {
    const seed = await seedGroups(orm, { alumnos: 2, grupos: 3, maxIntegrantes: 2 });
    const [origenA, origenB, destino] = seed.grupoIds;
    await orm.em.getConnection().execute(
      `update "grupo" set "max_integrantes" = 1 where "id" = ?`,
      [destino]
    );
    await seedMembership(orm, origenA!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
    await seedMembership(orm, origenB!, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);

    const results = await Promise.allSettled(
      [0, 1].map(async (index) =>
        moverAlumnoDeGrupo({ acceso: accesoSinGithub,
          assignmentId: seed.assignmentId,
          grupoDestinoId: destino!,
          githubUsername: seed.githubUsernames[index]!,
          actor: await participanteDeAlumno(orm, seed.alumnoIds[index]!),
          realizadoPor: seed.githubUsernames[index]!,
        })
      )
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(GrupoLlenoError);

    const memberships = await orm.em.getConnection().execute<{ count: string }[]>(
      `select count(*) from "grupo_miembro" where "assignment_id" = ?`,
      [seed.assignmentId]
    );
    expect(Number(memberships[0]?.count)).toBe(2);
  });

  it("una salida concurrente con la creación de la entrega nunca deja una entrega huérfana", async () => {
    const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);

    await Promise.allSettled([
      salirDeGrupo({ acceso: accesoSinGithub,
        assignmentId: seed.assignmentId,
        grupoId: seed.grupoIds[0]!,
        githubUsername: seed.githubUsernames[0]!,
        actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        realizadoPor: seed.githubUsernames[0]!,
      }),
      crearEntregaSiAssignmentDisponible({
        assignmentId: seed.assignmentId,
        repoName: `tp-${seed.assignmentId}-los-lambdas`,
        repoUrl: "https://github.com/org/tp-concurrente",
        githubUsernames: [seed.githubUsernames[0]!],
        grupoId: seed.grupoIds[0]!,
      }),
    ]);

    // No importa cuál gana la carrera: si la salida gana, borra el grupo y el
    // insert de la entrega falla por la FK (no crea una entrega huérfana). Si
    // la entrega gana, la salida la ve al re-leer bajo el lock y no borra el
    // grupo. Estado final: o existen ambos y la entrega referencia al grupo
    // seedeado, o no existe ninguno de los dos — nunca uno sin el otro.
    const [grupoRows, entregaRows] = await Promise.all([
      orm.em
        .getConnection()
        .execute<{ id: string }[]>(`select "id" from "grupo" where "id" = ?`, [seed.grupoIds[0]]),
      orm.em
        .getConnection()
        .execute<{ grupo_id: string | null }[]>(
          `select "grupo_id" from "entrega" where "assignment_id" = ?`,
          [seed.assignmentId]
        ),
    ]);

    if (entregaRows.length > 0) {
      expect(grupoRows).toHaveLength(1);
      expect(entregaRows[0]?.grupo_id).toBe(seed.grupoIds[0]);
    } else {
      expect(grupoRows).toHaveLength(0);
    }
  });

  it("un intercambio simétrico entre dos alumnos resuelve sin deadlock", async () => {
    // Cuatro alumnos, dos por grupo: si cada origen tuviera un solo
    // integrante, moverlo lo dejaría vacío y el grupo se borraría (correcto,
    // pero rompe la premisa del intercambio). Con dos integrantes por grupo
    // y cupo 3, ninguno de los dos grupos queda vacío ni lleno durante el
    // cruce, así que la única variable que se está probando es el orden de
    // los locks.
    const seed = await seedGroups(orm, { alumnos: 4, grupos: 2, maxIntegrantes: 3 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[2]!, seed.githubUsernames[2]!);
    await seedMembership(orm, seed.grupoIds[1]!, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);
    await seedMembership(orm, seed.grupoIds[1]!, seed.assignmentId, seed.alumnoIds[3]!, seed.githubUsernames[3]!);

    const results = await Promise.allSettled([
      moverAlumnoDeGrupo({ acceso: accesoSinGithub,
        assignmentId: seed.assignmentId,
        grupoDestinoId: seed.grupoIds[1]!,
        githubUsername: seed.githubUsernames[0]!,
        actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        realizadoPor: seed.githubUsernames[0]!,
      }),
      moverAlumnoDeGrupo({ acceso: accesoSinGithub,
        assignmentId: seed.assignmentId,
        grupoDestinoId: seed.grupoIds[0]!,
        githubUsername: seed.githubUsernames[1]!,
        actor: await participanteDeAlumno(orm, seed.alumnoIds[1]!),
        realizadoPor: seed.githubUsernames[1]!,
      }),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        expect(String(result.reason)).not.toContain("deadlock detected");
      }
    }
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);

    const memberships = await orm.em.getConnection().execute<{ count: string }[]>(
      `select count(*) from "grupo_miembro" where "assignment_id" = ?`,
      [seed.assignmentId]
    );
    expect(Number(memberships[0]?.count)).toBe(4);

    const alumno0Grupo = await orm.em.getConnection().execute<{ grupo_id: string }[]>(
      `select "grupo_id" from "grupo_miembro" where "alumno_id" = ?`,
      [seed.alumnoIds[0]]
    );
    expect(alumno0Grupo[0]?.grupo_id).toBe(seed.grupoIds[1]);

    const alumno1Grupo = await orm.em.getConnection().execute<{ grupo_id: string }[]>(
      `select "grupo_id" from "grupo_miembro" where "alumno_id" = ?`,
      [seed.alumnoIds[1]]
    );
    expect(alumno1Grupo[0]?.grupo_id).toBe(seed.grupoIds[0]);
  });

  it("registra la auditoría, incluida la fila cuyo grupo origen ya no existe", async () => {
    const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
    await seedMembership(orm, seed.grupoIds[0]!, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);

    await salirDeGrupo({ acceso: accesoSinGithub,
      assignmentId: seed.assignmentId,
      grupoId: seed.grupoIds[0]!,
      githubUsername: seed.githubUsernames[0]!,
      actor: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
      realizadoPor: seed.githubUsernames[0]!,
      motivo: "me equivoqué de grupo",
    });

    const rows = await orm.em.getConnection().execute<
      {
        accion: string;
        origen: string;
        grupo_origen_id: string;
        grupo_origen_eliminado: boolean;
        motivo: string;
      }[]
    >(
      `select "accion", "origen", "grupo_origen_id", "grupo_origen_eliminado", "motivo"
       from "cambio_membresia" where "assignment_id" = ?`,
      [seed.assignmentId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accion: "baja",
      origen: "alumno",
      grupo_origen_id: seed.grupoIds[0],
      grupo_origen_eliminado: true,
      motivo: "me equivoqué de grupo",
    });

    // El grupo referenciado por la fila de auditoría ya no existe: confirma
    // que la ausencia de FK es necesaria, no defensiva.
    const grupoAunExiste = await orm.em.getConnection().execute<{ id: string }[]>(
      `select "id" from "grupo" where "id" = ?`,
      [seed.grupoIds[0]]
    );
    expect(grupoAunExiste).toEqual([]);
  });
});
