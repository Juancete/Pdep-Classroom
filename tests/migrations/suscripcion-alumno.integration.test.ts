import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION =
  "Migration20260813190000_group_membership_invariants";
const SUSCRIPCION_ALUMNO_MIGRATION =
  "Migration20260827120000_suscripcion_alumno";

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

describe("Migration20260827120000_suscripcion_alumno", () => {
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

  it("backfillea el estado existente, dropea las columnas viejas y revierte con los valores restaurados", async () => {
    const migrator = orm.getMigrator();
    const connection = orm.em.getConnection();
    await migrator.up({ to: PREVIOUS_MIGRATION });

    const comisionId = randomUUID();
    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2026, 'sheet-migration-test', false, '{}'::jsonb)`,
      [comisionId]
    );

    // Alumno con estado "fallido", email sincronizado y dos pendientes de
    // baja acumulados — el caso que más información arrastra al backfill.
    const alumnoConFallaId = randomUUID();
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email",
         "comision_id", "google_group_estado", "google_group_email_sincronizado",
         "google_group_emails_pendientes_baja", "google_group_ultimo_error")
       values (?, '20001', 'Ada', 'Lovelace', 'ada-suscripcion', 'ada@example.com', ?,
               'fallido', 'ada@example.com', ARRAY['viejo1@example.com','viejo2@example.com'],
               'Sin permisos')`,
      [alumnoConFallaId, comisionId]
    );

    // Alumno en el default "pendiente", sin actividad todavía.
    const alumnoPendienteId = randomUUID();
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email", "comision_id")
       values (?, '20002', 'Grace', 'Hopper', 'grace-suscripcion', 'grace@example.com', ?)`,
      [alumnoPendienteId, comisionId]
    );

    await migrator.up({ to: SUSCRIPCION_ALUMNO_MIGRATION });

    const suscripcionConFalla = await connection.execute<
      {
        canal: string;
        estado: string;
        destinatario_sincronizado: string;
        destinatarios_pendientes_baja: string[];
        ultimo_error: string;
      }[]
    >(
      `select "canal", "estado", "destinatario_sincronizado",
              "destinatarios_pendientes_baja", "ultimo_error"
         from "suscripcion_alumno"
        where "alumno_id" = ?`,
      [alumnoConFallaId]
    );
    expect(suscripcionConFalla[0]).toEqual({
      canal: "google_groups",
      estado: "fallida",
      destinatario_sincronizado: "ada@example.com",
      destinatarios_pendientes_baja: ["viejo1@example.com", "viejo2@example.com"],
      ultimo_error: "Sin permisos",
    });

    const suscripcionPendiente = await connection.execute<
      { canal: string; estado: string }[]
    >(
      `select "canal", "estado" from "suscripcion_alumno" where "alumno_id" = ?`,
      [alumnoPendienteId]
    );
    expect(suscripcionPendiente[0]).toEqual({
      canal: "google_groups",
      estado: "pendiente",
    });

    const columnasViejas = await connection.execute<{ column_name: string }[]>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'alumno'
          and column_name like 'google_group_%'`
    );
    expect(columnasViejas).toEqual([]);

    await migrator.down({ migrations: [SUSCRIPCION_ALUMNO_MIGRATION] });

    const restaurado = await connection.execute<
      {
        google_group_estado: string;
        google_group_email_sincronizado: string;
        google_group_emails_pendientes_baja: string[];
        google_group_ultimo_error: string;
      }[]
    >(
      `select "google_group_estado", "google_group_email_sincronizado",
              "google_group_emails_pendientes_baja", "google_group_ultimo_error"
         from "alumno"
        where "id" = ?`,
      [alumnoConFallaId]
    );
    expect(restaurado[0]).toEqual({
      google_group_estado: "fallido",
      google_group_email_sincronizado: "ada@example.com",
      google_group_emails_pendientes_baja: ["viejo1@example.com", "viejo2@example.com"],
      google_group_ultimo_error: "Sin permisos",
    });

    const tablaSuscripcion = await connection.execute<{ table_name: string }[]>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = 'suscripcion_alumno'`
    );
    expect(tablaSuscripcion).toEqual([]);
  });
});
