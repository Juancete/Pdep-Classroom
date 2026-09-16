import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION = "Migration20260827120000_suscripcion_alumno";
const ADMINISTRADOR_MIGRATION = "Migration20260916120000_administrador";

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

describe("Migration20260916120000_administrador", () => {
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

  it("crea la tabla con el índice único sobre github_username, rechaza duplicados y revierte con down()", async () => {
    const migrator = orm.getMigrator();
    const connection = orm.em.getConnection();
    await migrator.up({ to: PREVIOUS_MIGRATION });
    await migrator.up({ to: ADMINISTRADOR_MIGRATION });

    const id = randomUUID();
    await connection.execute(
      `insert into "administrador"
        ("id", "github_username", "nombre", "activo",
         "creado_en", "creado_por", "modificado_en", "modificado_por")
       values (?, 'ayudante1', 'Ayudante Uno', true, now(), 'juancete', now(), 'juancete')`,
      [id]
    );

    const filas = await connection.execute<{ github_username: string; activo: boolean }[]>(
      `select "github_username", "activo" from "administrador" where "id" = ?`,
      [id]
    );
    expect(filas[0]).toEqual({ github_username: "ayudante1", activo: true });

    // Criterio de aceptación del issue #83: "altas concurrentes respetan la
    // restricción única" — el índice único de la migración es lo único que
    // puede garantizar esto bajo carrera real (el chequeo previo en la
    // aplicación no alcanza entre dos requests simultáneas).
    await expect(
      connection.execute(
        `insert into "administrador"
          ("id", "github_username", "activo",
           "creado_en", "creado_por", "modificado_en", "modificado_por")
         values (?, 'ayudante1', true, now(), 'otro-responsable', now(), 'otro-responsable')`,
        [randomUUID()]
      )
    ).rejects.toThrow(/duplicate key value violates unique constraint "administrador_github_username_unique_idx"/);

    await migrator.down({ migrations: [ADMINISTRADOR_MIGRATION] });

    const tabla = await connection.execute<{ table_name: string }[]>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = 'administrador'`
    );
    expect(tabla).toEqual([]);
  });
});
