import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION =
  "Migration20260529130107_alumno_comision_not_null_and_cascade";
const GOOGLE_GROUP_MIGRATION =
  "Migration20260610120000_add_google_group_state_to_alumno";

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

async function getDeleteRule(
  orm: MikroORM,
  constraintName: string
): Promise<string | undefined> {
  const rows = await orm.em.getConnection().execute<{ delete_rule: string }[]>(
    `select delete_rule
       from information_schema.referential_constraints
      where constraint_schema = 'public'
        and constraint_name = ?`,
    [constraintName]
  );
  return rows[0]?.delete_rule;
}

describe("Migration20260610120000_add_google_group_state_to_alumno", () => {
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

  it("migra alumnos existentes, conserva defaults y revierte limpiamente", async () => {
    const migrator = orm.getMigrator();
    const connection = orm.em.getConnection();
    await migrator.up({ to: PREVIOUS_MIGRATION });

    const comisionId = randomUUID();
    const alumnoExistenteId = randomUUID();
    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2026, 'sheet-migration-test', false, '{}'::jsonb)`,
      [comisionId]
    );
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email", "comision_id")
       values (?, '10001', 'Ada', 'Lovelace', 'ada-migration', 'ada@example.com', ?)`,
      [alumnoExistenteId, comisionId]
    );

    await migrator.up({ to: GOOGLE_GROUP_MIGRATION });

    const alumnosExistentes = await connection.execute<
      { google_group_emails_pendientes_baja: string[] }[]
    >(
      `select "google_group_emails_pendientes_baja"
         from "alumno"
        where "id" = ?`,
      [alumnoExistenteId]
    );
    expect(alumnosExistentes[0]?.google_group_emails_pendientes_baja).toEqual([]);

    const columns = await connection.execute<
      { is_nullable: string; column_default: string | null }[]
    >(
      `select is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'alumno'
          and column_name = 'google_group_emails_pendientes_baja'`
    );
    expect(columns[0]?.is_nullable).toBe("NO");
    expect(columns[0]?.column_default).toBe("'{}'::text[]");

    const alumnoNuevoId = randomUUID();
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email", "comision_id")
       values (?, '10002', 'Grace', 'Hopper', 'grace-migration', 'grace@example.com', ?)`,
      [alumnoNuevoId, comisionId]
    );
    const alumnosNuevos = await connection.execute<
      { google_group_estado: string; google_group_emails_pendientes_baja: string[] }[]
    >(
      `select "google_group_estado", "google_group_emails_pendientes_baja"
         from "alumno"
        where "id" = ?`,
      [alumnoNuevoId]
    );
    expect(alumnosNuevos[0]).toEqual({
      google_group_estado: "pendiente",
      google_group_emails_pendientes_baja: [],
    });
    expect(await getDeleteRule(orm, "alumno_comision_id_foreign")).toBe(
      "CASCADE"
    );
    expect(await getDeleteRule(orm, "assignment_comision_id_foreign")).toBe(
      "CASCADE"
    );

    await migrator.down({ migrations: [GOOGLE_GROUP_MIGRATION] });

    const remainingColumns = await connection.execute<{ column_name: string }[]>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'alumno'
          and column_name like 'google_group_%'`
    );
    expect(remainingColumns).toEqual([]);
    expect(await getDeleteRule(orm, "alumno_comision_id_foreign")).toBe(
      "CASCADE"
    );
    expect(await getDeleteRule(orm, "assignment_comision_id_foreign")).toBe(
      "CASCADE"
    );

  });
});
