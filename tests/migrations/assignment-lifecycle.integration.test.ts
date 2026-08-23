import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION = "Migration20260814160000_group_repo_name";
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

async function insertAssignmentLegacy(
  connection: ReturnType<MikroORM["em"]["getConnection"]>,
  params: { id: string; comisionId: string; createdAt: string }
): Promise<void> {
  await connection.execute(
    `insert into "assignment"
      ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
       "created_at", "comision_id", "inscripciones_cerradas")
     values (?, 'TP preexistente', ?, 'org/template', 'funcional', 'individual',
       ?, ?, false)`,
    [params.id, `tp-${params.id}`, params.createdAt, params.comisionId]
  );
}

describe("Migration20260814180000_assignment_lifecycle", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig,
      clientUrl: getSafeTestDatabaseUrl(),
      debug: false,
      migrations: { ...ormConfig.migrations, snapshot: false },
    });
    await resetPublicSchema(orm);
    await orm.getMigrator().up({ to: PREVIOUS_MIGRATION });
  });

  afterAll(async () => {
    if (!orm) return;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it("backfillea los assignments existentes a 'publicado' y sella publicadoEn", async () => {
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();
    const createdAt = "2026-01-15T12:00:00.000Z";

    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2026, ?, false, '{}'::jsonb)`,
      [comisionId, `sheet-${comisionId}`]
    );
    await insertAssignmentLegacy(connection, { id: assignmentId, comisionId, createdAt });

    await orm.getMigrator().up({ to: LIFECYCLE_MIGRATION });

    const rows = await connection.execute<
      {
        estado_nombre: string;
        publicado_en: Date;
        publicado_por: string | null;
        archivado_en: Date | null;
        archivado_por: string | null;
      }[]
    >(
      `select "estado_nombre", "publicado_en", "publicado_por", "archivado_en", "archivado_por"
         from "assignment" where "id" = ?`,
      [assignmentId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.estado_nombre).toBe("publicado");
    expect(rows[0]!.publicado_en).not.toBeNull();
    expect(new Date(rows[0]!.publicado_en).toISOString()).toBe(createdAt);
    expect(rows[0]!.publicado_por).toBeNull();
    expect(rows[0]!.archivado_en).toBeNull();
    expect(rows[0]!.archivado_por).toBeNull();
  });

  it("un assignment nuevo insertado después de la migración nace en 'borrador'", async () => {
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();

    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2027, ?, false, '{}'::jsonb)`,
      [comisionId, `sheet-${comisionId}`]
    );
    await connection.execute(
      `insert into "assignment"
        ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
         "created_at", "comision_id", "inscripciones_cerradas")
       values (?, 'TP nuevo', ?, 'org/template', 'funcional', 'individual',
         now(), ?, false)`,
      [assignmentId, `tp-nuevo-${assignmentId}`, comisionId]
    );

    const rows = await connection.execute<{ estado_nombre: string }[]>(
      `select "estado_nombre" from "assignment" where "id" = ?`,
      [assignmentId]
    );
    expect(rows[0]!.estado_nombre).toBe("borrador");
  });

  it("el check constraint rechaza un estado_nombre desconocido", async () => {
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();

    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2028, ?, false, '{}'::jsonb)`,
      [comisionId, `sheet-${comisionId}`]
    );

    await expect(
      connection.execute(
        `insert into "assignment"
          ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
           "created_at", "comision_id", "inscripciones_cerradas", "estado_nombre")
         values (?, 'TP inválido', ?, 'org/template', 'funcional', 'individual',
           now(), ?, false, 'invalido')`,
        [assignmentId, `tp-invalido-${assignmentId}`, comisionId]
      )
    ).rejects.toThrow();
  });

  it("las entidades no divergen del esquema aplicado por la migración", async () => {
    const { up } = await orm.getSchemaGenerator().getUpdateSchemaMigrationSQL();
    expect(up).not.toContain('"estado_nombre"');
    expect(up).not.toContain('"publicado_en"');
    expect(up).not.toContain('"archivado_en"');
  });

  it("down() elimina las columnas del ciclo de vida", async () => {
    await orm.getMigrator().down({ migrations: [LIFECYCLE_MIGRATION] });

    const connection = orm.em.getConnection();
    const columns = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'assignment'
           and column_name in
             ('estado_nombre', 'publicado_en', 'publicado_por', 'archivado_en', 'archivado_por')`
    );
    expect(columns).toEqual([]);

    // deja la DB como la encontró para no afectar otros tests del archivo
    await orm.getMigrator().up({ to: LIFECYCLE_MIGRATION });
  });
});
