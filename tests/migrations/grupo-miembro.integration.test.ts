import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION = "Migration20260917120000_docente";
const GRUPO_MIEMBRO_MIGRATION = "Migration20260918120000_grupo_miembro";

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

describe("Migration20260918120000_grupo_miembro", () => {
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
  });

  afterAll(async () => {
    if (!orm) return;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it("copia el pivot viejo en minúsculas, agrega tipo_integrantes, admite miembros sin alumno y revierte perdiendo sólo esos", async () => {
    const migrator = orm.getMigrator();
    const connection = orm.em.getConnection();
    await migrator.up({ to: PREVIOUS_MIGRATION });

    const comisionId = randomUUID();
    await connection.execute(
      `insert into "comision" ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2026, 'sheet-grupo-miembro-test', false, '{}'::jsonb)`,
      [comisionId]
    );

    const assignmentId = randomUUID();
    await connection.execute(
      `insert into "assignment"
        ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
         "created_at", "comision_id", "max_integrantes", "inscripciones_cerradas",
         "estado_nombre")
       values (?, 'TP grupal', 'tp-grupo-miembro', 'org/template', 'funcional', 'grupal',
         now(), ?, 3, false, 'publicado')`,
      [assignmentId, comisionId]
    );

    const alumnoId = randomUUID();
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email", "comision_id")
       values (?, '30001', 'Ada', 'Lovelace', 'AdaLovelace', 'ada@example.com', ?)`,
      [alumnoId, comisionId]
    );

    const grupoId = randomUUID();
    await connection.execute(
      `insert into "grupo"
        ("id", "nombre", "nombre_normalizado", "paradigma", "max_integrantes",
         "creado_por", "assignment_id")
       values (?, 'Los Lambdas', 'los-lambdas', 'funcional', 3, 'AdaLovelace', ?)`,
      [grupoId, assignmentId]
    );

    await connection.execute(
      `insert into "grupo_alumnos" ("grupo_id", "alumno_id", "assignment_id")
       values (?, ?, ?)`,
      [grupoId, alumnoId, assignmentId]
    );

    await migrator.up({ to: GRUPO_MIEMBRO_MIGRATION });

    // El backfill copia el username en minúsculas (canónico) y preserva el
    // vínculo con `Alumno`.
    const miembros = await connection.execute<
      { github_username: string; alumno_id: string; assignment_id: string }[]
    >(
      `select "github_username", "alumno_id", "assignment_id" from "grupo_miembro" where "grupo_id" = ?`,
      [grupoId]
    );
    expect(miembros).toEqual([
      { github_username: "adalovelace", alumno_id: alumnoId, assignment_id: assignmentId },
    ]);

    const tipoIntegrantes = await connection.execute<{ tipo_integrantes: string }[]>(
      `select "tipo_integrantes" from "grupo" where "id" = ?`,
      [grupoId]
    );
    expect(tipoIntegrantes[0]?.tipo_integrantes).toBe("alumnos");

    // El índice único rechaza el mismo username dos veces en el mismo assignment.
    await expect(
      connection.execute(
        `insert into "grupo_miembro" ("id", "grupo_id", "assignment_id", "github_username")
         values (?, ?, ?, 'adalovelace')`,
        [randomUUID(), grupoId, assignmentId]
      )
    ).rejects.toThrow(/grupo_miembro_assignment_username_unique_idx/);

    // Se puede insertar un miembro sin alumno_id — un docente en un grupo de
    // demo, sin fila en `Alumno` (issue #107/#112).
    const miembroDocenteId = randomUUID();
    await connection.execute(
      `insert into "grupo_miembro" ("id", "grupo_id", "assignment_id", "github_username")
       values (?, ?, ?, 'profe-docente')`,
      [miembroDocenteId, grupoId, assignmentId]
    );
    const miembroDocente = await connection.execute<{ alumno_id: string | null }[]>(
      `select "alumno_id" from "grupo_miembro" where "id" = ?`,
      [miembroDocenteId]
    );
    expect(miembroDocente[0]?.alumno_id).toBeNull();

    await migrator.down({ migrations: [GRUPO_MIEMBRO_MIGRATION] });

    // Sólo vuelve el miembro con alumno vinculado: el docente sin fila en
    // `Alumno` se pierde en el rollback (documentado en la migración).
    const pivotViejo = await connection.execute<
      { grupo_id: string; alumno_id: string; assignment_id: string }[]
    >(
      `select "grupo_id", "alumno_id", "assignment_id" from "grupo_alumnos" where "grupo_id" = ?`,
      [grupoId]
    );
    expect(pivotViejo).toEqual([
      { grupo_id: grupoId, alumno_id: alumnoId, assignment_id: assignmentId },
    ]);

    const columnaTipoIntegrantes = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
       where table_name = 'grupo' and column_name = 'tipo_integrantes'`
    );
    expect(columnaTipoIntegrantes).toEqual([]);

    const tablaGrupoMiembro = await connection.execute<{ table_name: string }[]>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = 'grupo_miembro'`
    );
    expect(tablaGrupoMiembro).toEqual([]);
  });
});
