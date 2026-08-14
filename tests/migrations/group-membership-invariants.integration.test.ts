import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const ormHolder = vi.hoisted(() => ({ orm: undefined as MikroORM | undefined }));

vi.mock("@/lib/db", () => ({
  getEM: async () => {
    if (!ormHolder.orm) throw new Error("ORM de integración no inicializado");
    return ormHolder.orm.em.fork();
  },
}));

import {
  AlumnoYaEnGrupoDelAssignmentError,
  GrupoLlenoError,
  NombreGrupoDuplicadoError,
} from "../../src/domain/entities";
import {
  crearGrupo,
  unirseAGrupo,
  upsertGrupoConMiembro,
} from "../../src/lib/repositories/GrupoRepository";
import { Alumno, GrupalAssignment } from "../../src/domain/entities";

const PREVIOUS_MIGRATION =
  "Migration20260610120000_add_google_group_state_to_alumno";
const MEMBERSHIP_MIGRATION =
  "Migration20260813190000_group_membership_invariants";
const GROUP_REPO_NAMING_MIGRATION =
  "Migration20260814160000_group_repo_name";
let groupRepoNamingReady = false;

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

type Seed = {
  comisionId: string;
  assignmentId: string;
  alumnoIds: string[];
  grupoIds: string[];
};

async function seedGroups(
  orm: MikroORM,
  options: { alumnos: number; grupos: number; maxIntegrantes: number }
): Promise<Seed> {
  const connection = orm.em.getConnection();
  const comisionId = randomUUID();
  const assignmentId = randomUUID();
  const alumnoIds = Array.from({ length: options.alumnos }, () => randomUUID());
  const grupoIds = Array.from({ length: options.grupos }, () => randomUUID());

  await connection.execute(
    `insert into "comision"
      ("id", "anio", "spreadsheet_id", "activa", "column_config")
     values (?, 2026, ?, false, '{}'::jsonb)`,
    [comisionId, `sheet-${comisionId}`]
  );
  await connection.execute(
    `insert into "assignment"
      ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
       "created_at", "comision_id", "max_integrantes", "inscripciones_cerradas")
     values (?, 'TP concurrente', ?, 'org/template', 'funcional', 'grupal',
       now(), ?, ?, false)`,
    [assignmentId, `tp-${assignmentId}`, comisionId, options.maxIntegrantes]
  );

  for (const [index, alumnoId] of alumnoIds.entries()) {
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email", "comision_id")
       values (?, ?, ?, 'Test', ?, ?, ?)`,
      [
        alumnoId,
        `${1000 + index}`,
        `Alumno ${index}`,
        `alumno-${index}-${alumnoId}`,
        `alumno-${index}-${alumnoId}@example.com`,
        comisionId,
      ]
    );
  }

  for (const [index, grupoId] of grupoIds.entries()) {
    if (groupRepoNamingReady) {
      await connection.execute(
        `insert into "grupo"
          ("id", "nombre", "nombre_normalizado", "paradigma",
           "max_integrantes", "creado_por", "assignment_id")
         values (?, ?, ?, 'funcional', ?, 'test', ?)`,
        [
          grupoId,
          `Grupo ${index}`,
          `grupo-${index}`,
          options.maxIntegrantes,
          assignmentId,
        ]
      );
    } else {
      await connection.execute(
        `insert into "grupo"
          ("id", "nombre", "paradigma", "max_integrantes", "creado_por", "assignment_id")
         values (?, ?, 'funcional', ?, 'test', ?)`,
        [grupoId, `Grupo ${index}`, options.maxIntegrantes, assignmentId]
      );
    }
  }

  return { comisionId, assignmentId, alumnoIds, grupoIds };
}

function expectOneConcurrentConflict(
  results: PromiseSettledResult<unknown>[],
  ErrorType:
    | typeof AlumnoYaEnGrupoDelAssignmentError
    | typeof GrupoLlenoError
    | typeof NombreGrupoDuplicadoError
): void {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toBeInstanceOf(ErrorType);
}

describe.sequential("invariantes concurrentes de membresías de grupos", () => {
  let orm: MikroORM;
  let migrationReady = false;

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
    await orm.getMigrator().up({ to: PREVIOUS_MIGRATION });
    ormHolder.orm = orm;
  });

  afterAll(async () => {
    if (!orm) return;
    ormHolder.orm = undefined;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it("rechaza membresías históricas duplicadas sin decidir cuál borrar", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 1,
      grupos: 2,
      maxIntegrantes: 2,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `insert into "grupo_alumnos" ("grupo_id", "alumno_id") values (?, ?), (?, ?)`,
      [seed.grupoIds[0], seed.alumnoIds[0], seed.grupoIds[1], seed.alumnoIds[0]]
    );

    await expect(
      orm.getMigrator().up({ to: MEMBERSHIP_MIGRATION })
    ).rejects.toThrow("hay alumnos en mas de un grupo");

    const columns = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
       where table_name = 'grupo_alumnos' and column_name = 'assignment_id'`
    );
    expect(columns).toEqual([]);
    await connection.execute('truncate table "comision" cascade');
  });

  it("rechaza grupos históricos que ya superan el cupo", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 2,
      grupos: 1,
      maxIntegrantes: 1,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `insert into "grupo_alumnos" ("grupo_id", "alumno_id") values (?, ?), (?, ?)`,
      [seed.grupoIds[0], seed.alumnoIds[0], seed.grupoIds[0], seed.alumnoIds[1]]
    );

    await expect(
      orm.getMigrator().up({ to: MEMBERSHIP_MIGRATION })
    ).rejects.toThrow("hay grupos con mas alumnos");

    await connection.execute('truncate table "comision" cascade');
  });

  it("rechaza grupos históricos con nombre y paradigma duplicados", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 0,
      grupos: 2,
      maxIntegrantes: 2,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `update "grupo" set "nombre" = 'Los Lambdas' where "assignment_id" = ?`,
      [seed.assignmentId]
    );

    await expect(
      orm.getMigrator().up({ to: MEMBERSHIP_MIGRATION })
    ).rejects.toThrow("hay nombres y paradigmas duplicados");

    await connection.execute('truncate table "comision" cascade');
  });

  it("migra, completa assignment_id mediante trigger y revierte limpiamente", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 1,
      grupos: 1,
      maxIntegrantes: 2,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `insert into "grupo_alumnos" ("grupo_id", "alumno_id") values (?, ?)`,
      [seed.grupoIds[0], seed.alumnoIds[0]]
    );

    await orm.getMigrator().up({ to: MEMBERSHIP_MIGRATION });
    const rows = await connection.execute<{ assignment_id: string }[]>(
      `select "assignment_id" from "grupo_alumnos" where "alumno_id" = ?`,
      [seed.alumnoIds[0]]
    );
    expect(rows[0]?.assignment_id).toBe(seed.assignmentId);

    await orm.getMigrator().down({ migrations: [MEMBERSHIP_MIGRATION] });
    const columnsAfterDown = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
       where table_name = 'grupo_alumnos' and column_name = 'assignment_id'`
    );
    expect(columnsAfterDown).toEqual([]);

    await orm.getMigrator().up({ to: MEMBERSHIP_MIGRATION });
    migrationReady = true;
  });

  it("el schema diff preserva los objetos manuales del pivot", async () => {
    const { up } = await orm
      .getSchemaGenerator()
      .getUpdateSchemaMigrationSQL();

    expect(up).not.toContain('drop table if exists "grupo_alumnos"');
    expect(up).not.toContain('drop column "assignment_id"');
    expect(up).not.toContain(
      'drop index "grupo_alumnos_assignment_alumno_unique_idx"'
    );
    expect(up).not.toContain(
      'drop constraint "grupo_alumnos_grupo_assignment_foreign"'
    );
    expect(up).not.toContain('drop constraint "grupo_id_assignment_unique"');
  });

  beforeEach(async () => {
    if (!migrationReady) return;
    await orm.em.getConnection().execute('truncate table "comision" cascade');
  });

  it("rechaza nombres históricos que normalizan a vacío", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 0,
      grupos: 1,
      maxIntegrantes: 2,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `update "grupo" set "nombre" = '+++' where "id" = ?`,
      [seed.grupoIds[0]]
    );

    await expect(
      orm.getMigrator().up({ to: GROUP_REPO_NAMING_MIGRATION })
    ).rejects.toThrow("no contiene letras ni números");

    const columns = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
       where table_name = 'grupo' and column_name = 'nombre_normalizado'`
    );
    expect(columns).toEqual([]);
  });

  it("rechaza nombres históricos distintos que generan el mismo identificador", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 0,
      grupos: 2,
      maxIntegrantes: 2,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `update "grupo" set "nombre" = case "id"
         when ? then 'Los Lógicos'
         else 'los-logicos!'
       end
       where "assignment_id" = ?`,
      [seed.grupoIds[0], seed.assignmentId]
    );

    await expect(
      orm.getMigrator().up({ to: GROUP_REPO_NAMING_MIGRATION })
    ).rejects.toThrow("hay nombres que generan el mismo identificador");
  });

  it("migra nombres, revierte y deja el schema final alineado", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 0,
      grupos: 1,
      maxIntegrantes: 2,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `update "grupo" set "nombre" = 'Los Lógicos ++' where "id" = ?`,
      [seed.grupoIds[0]]
    );

    await orm.getMigrator().up({ to: GROUP_REPO_NAMING_MIGRATION });
    const rows = await connection.execute<{ nombre_normalizado: string }[]>(
      `select "nombre_normalizado" from "grupo" where "id" = ?`,
      [seed.grupoIds[0]]
    );
    expect(rows).toEqual([{ nombre_normalizado: "los-logicos" }]);

    await orm.getMigrator().down({ migrations: [GROUP_REPO_NAMING_MIGRATION] });
    const columnsAfterDown = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
       where table_name = 'grupo' and column_name = 'nombre_normalizado'`
    );
    expect(columnsAfterDown).toEqual([]);

    await orm.getMigrator().up({ to: GROUP_REPO_NAMING_MIGRATION });
    groupRepoNamingReady = true;
    const { up } = await orm.getSchemaGenerator().getUpdateSchemaMigrationSQL();
    expect(up).not.toContain('alter table "grupo"');
  });

  it("serializa dos joins que compiten por el último cupo", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 3,
      grupos: 1,
      maxIntegrantes: 2,
    });
    const connection = orm.em.getConnection();
    await connection.execute(
      `insert into "grupo_alumnos" ("grupo_id", "alumno_id") values (?, ?)`,
      [seed.grupoIds[0], seed.alumnoIds[0]]
    );

    const results = await Promise.allSettled(
      [seed.alumnoIds[1], seed.alumnoIds[2]].map((alumnoId) =>
        unirseAGrupo({
          assignmentId: seed.assignmentId,
          grupoId: seed.grupoIds[0]!,
          alumnoId,
          esAdmin: false,
        })
      )
    );

    expectOneConcurrentConflict(results, GrupoLlenoError);
    const count = await connection.execute<{ count: string }[]>(
      `select count(*) from "grupo_alumnos" where "grupo_id" = ?`,
      [seed.grupoIds[0]]
    );
    expect(Number(count[0]?.count)).toBe(2);
  });

  it("impide que un alumno se una a dos grupos en paralelo", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 1,
      grupos: 2,
      maxIntegrantes: 2,
    });

    const results = await Promise.allSettled(
      seed.grupoIds.map((grupoId) =>
        unirseAGrupo({
          assignmentId: seed.assignmentId,
          grupoId,
          alumnoId: seed.alumnoIds[0]!,
          esAdmin: false,
        })
      )
    );

    expectOneConcurrentConflict(results, AlumnoYaEnGrupoDelAssignmentError);
    const memberships = await orm.em.getConnection().execute<{ count: string }[]>(
      `select count(*) from "grupo_alumnos"
       where "assignment_id" = ? and "alumno_id" = ?`,
      [seed.assignmentId, seed.alumnoIds[0]]
    );
    expect(Number(memberships[0]?.count)).toBe(1);
  });

  it("revierte el grupo perdedor si el alumno crea dos grupos en paralelo", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 1,
      grupos: 0,
      maxIntegrantes: 3,
    });

    const results = await Promise.allSettled(
      ["Grupo A", "Grupo B"].map((nombre) =>
        crearGrupo({
          assignmentId: seed.assignmentId,
          alumnoId: seed.alumnoIds[0]!,
          nombre,
          esAdmin: false,
        })
      )
    );

    expectOneConcurrentConflict(results, AlumnoYaEnGrupoDelAssignmentError);
    const rows = await orm.em.getConnection().execute<{ grupos: string; membresias: string }[]>(
      `select
         (select count(*) from "grupo" where "assignment_id" = ?) as grupos,
         (select count(*) from "grupo_alumnos" where "assignment_id" = ?) as membresias`,
      [seed.assignmentId, seed.assignmentId]
    );
    expect(rows[0]).toEqual({ grupos: "1", membresias: "1" });
  });

  it("la sincronización desde Sheets reporta el mismo conflicto explícito", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 1,
      grupos: 2,
      maxIntegrantes: 3,
    });

    const sync = async (groupIndex: number) => {
      const em = orm.em.fork();
      const [assignment, alumno] = await Promise.all([
        em.findOneOrFail(GrupalAssignment, { id: seed.assignmentId }),
        em.findOneOrFail(Alumno, { id: seed.alumnoIds[0] }),
      ]);
      return upsertGrupoConMiembro({
        nombreGrupo: `Grupo ${groupIndex}`,
        paradigma: "funcional",
        assignment,
        alumno,
      });
    };

    const results = await Promise.allSettled([sync(0), sync(1)]);

    expectOneConcurrentConflict(results, AlumnoYaEnGrupoDelAssignmentError);
    const memberships = await orm.em.getConnection().execute<{ count: string }[]>(
      `select count(*) from "grupo_alumnos"
       where "assignment_id" = ? and "alumno_id" = ?`,
      [seed.assignmentId, seed.alumnoIds[0]]
    );
    expect(Number(memberships[0]?.count)).toBe(1);
  });

  it("unifica dos upserts concurrentes con el mismo nombre de grupo", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 2,
      grupos: 0,
      maxIntegrantes: 3,
    });

    const sync = async (alumnoId: string) => {
      const em = orm.em.fork();
      const [assignment, alumno] = await Promise.all([
        em.findOneOrFail(GrupalAssignment, { id: seed.assignmentId }),
        em.findOneOrFail(Alumno, { id: alumnoId }),
      ]);
      return upsertGrupoConMiembro({
        nombreGrupo: "Los Lambdas",
        paradigma: "funcional",
        assignment,
        alumno,
      });
    };

    const grupos = await Promise.all(seed.alumnoIds.map(sync));

    expect(new Set(grupos.map((grupo) => grupo.id)).size).toBe(1);
    const rows = await orm.em.getConnection().execute<
      { grupos: string; membresias: string }[]
    >(
      `select
         (select count(*) from "grupo"
          where "assignment_id" = ? and "nombre" = 'Los Lambdas'
            and "paradigma" = 'funcional') as grupos,
         (select count(*) from "grupo_alumnos"
          where "assignment_id" = ?) as membresias`,
      [seed.assignmentId, seed.assignmentId]
    );
    expect(rows[0]).toEqual({ grupos: "1", membresias: "2" });
  });

  it("rechaza dos creaciones concurrentes cuyos nombres normalizan igual", async () => {
    const seed = await seedGroups(orm, {
      alumnos: 2,
      grupos: 0,
      maxIntegrantes: 3,
    });

    const results = await Promise.allSettled(
      ["Los Lógicos", "los-logicos!"].map((nombre, index) =>
        crearGrupo({
          assignmentId: seed.assignmentId,
          alumnoId: seed.alumnoIds[index]!,
          nombre,
          esAdmin: false,
        })
      )
    );

    expectOneConcurrentConflict(results, NombreGrupoDuplicadoError);
    const grupos = await orm.em.getConnection().execute<
      { nombre_normalizado: string }[]
    >(
      `select "nombre_normalizado" from "grupo" where "assignment_id" = ?`,
      [seed.assignmentId]
    );
    expect(grupos).toEqual([{ nombre_normalizado: "los-logicos" }]);
  });
});
