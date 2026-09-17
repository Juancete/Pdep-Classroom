import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION = "Migration20260916120000_administrador";
const DOCENTE_MIGRATION = "Migration20260917120000_docente";

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

describe("Migration20260917120000_docente", () => {
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

  it("renombra administrador a docente conservando las filas, el índice único y la PK; down() revierte todo", async () => {
    const migrator = orm.getMigrator();
    const connection = orm.em.getConnection();
    await migrator.up({ to: PREVIOUS_MIGRATION });

    const id = randomUUID();
    await connection.execute(
      `insert into "administrador"
        ("id", "github_username", "nombre", "activo",
         "creado_en", "creado_por", "modificado_en", "modificado_por")
       values (?, 'ayudante1', 'Ayudante Uno', true, now(), 'juancete', now(), 'juancete')`,
      [id]
    );

    await migrator.up({ to: DOCENTE_MIGRATION });

    // La fila cargada en "administrador" sigue ahí, ahora bajo "docente".
    const filas = await connection.execute<{ github_username: string; activo: boolean }[]>(
      `select "github_username", "activo" from "docente" where "id" = ?`,
      [id]
    );
    expect(filas[0]).toEqual({ github_username: "ayudante1", activo: true });

    // La tabla vieja ya no existe.
    const tablaVieja = await connection.execute<{ table_name: string }[]>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = 'administrador'`
    );
    expect(tablaVieja).toEqual([]);

    // El índice único se renombró (y sigue rechazando duplicados).
    const indices = await connection.execute<{ indexname: string }[]>(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and tablename = 'docente'
          and indexname = 'docente_github_username_unique_idx'`
    );
    expect(indices).toHaveLength(1);

    await expect(
      connection.execute(
        `insert into "docente"
          ("id", "github_username", "activo",
           "creado_en", "creado_por", "modificado_en", "modificado_por")
         values (?, 'ayudante1', true, now(), 'otro-responsable', now(), 'otro-responsable')`,
        [randomUUID()]
      )
    ).rejects.toThrow(/duplicate key value violates unique constraint "docente_github_username_unique_idx"/);

    // La constraint de PK se renombró.
    const constraints = await connection.execute<{ conname: string }[]>(
      `select conname from pg_constraint where conname = 'docente_pkey'`
    );
    expect(constraints).toHaveLength(1);
    const constraintsViejas = await connection.execute<{ conname: string }[]>(
      `select conname from pg_constraint where conname = 'administrador_pkey'`
    );
    expect(constraintsViejas).toEqual([]);

    // down(): todo vuelve a llamarse "administrador", con la misma fila.
    await migrator.down({ migrations: [DOCENTE_MIGRATION] });

    const filasRevertidas = await connection.execute<{ github_username: string }[]>(
      `select "github_username" from "administrador" where "id" = ?`,
      [id]
    );
    expect(filasRevertidas[0]).toEqual({ github_username: "ayudante1" });

    const tablaNueva = await connection.execute<{ table_name: string }[]>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = 'docente'`
    );
    expect(tablaNueva).toEqual([]);

    const indicesRevertidos = await connection.execute<{ indexname: string }[]>(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and tablename = 'administrador'
          and indexname = 'administrador_github_username_unique_idx'`
    );
    expect(indicesRevertidos).toHaveLength(1);

    const constraintsRevertidas = await connection.execute<{ conname: string }[]>(
      `select conname from pg_constraint where conname = 'administrador_pkey'`
    );
    expect(constraintsRevertidas).toHaveLength(1);

    await migrator.down({ migrations: [PREVIOUS_MIGRATION] });
  });
});
