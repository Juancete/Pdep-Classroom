import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION = "Migration20260818120000_membership_audit";
const CI_MIGRATION = "Migration20260819120000_ci_estado";

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
  params: { id: string; comisionId: string }
): Promise<void> {
  await connection.execute(
    `insert into "assignment"
      ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
       "created_at", "comision_id", "inscripciones_cerradas")
     values (?, 'TP preexistente', ?, 'org/template', 'funcional', 'individual',
       now(), ?, false)`,
    [params.id, `tp-${params.id}`, params.comisionId]
  );
}

describe("Migration20260819120000_ci_estado", () => {
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

  it("backfillea las entregas existentes a 'sin_consultar'", async () => {
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();
    const entregaId = randomUUID();

    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2026, ?, false, '{}'::jsonb)`,
      [comisionId, `sheet-${comisionId}`]
    );
    await insertAssignmentLegacy(connection, { id: assignmentId, comisionId });
    await connection.execute(
      `insert into "entrega"
        ("id", "assignment_id", "github_usernames", "repo_name", "repo_url",
         "repo_deleted", "created_at")
       values (?, ?, '{"juancito"}', ?, ?, false, now())`,
      [entregaId, assignmentId, `tp-juancito-${entregaId}`, "https://github.com/org/repo"]
    );

    await orm.getMigrator().up({ to: CI_MIGRATION });

    const rows = await connection.execute<
      {
        ci_resultado_nombre: string;
        ci_check_suite_ids: string[];
        ci_commit_sha: string | null;
        ci_detalle_url: string | null;
        ci_ejecutado_en: Date | null;
        ci_actualizado_en: Date | null;
      }[]
    >(
      `select "ci_resultado_nombre", "ci_check_suite_ids", "ci_commit_sha", "ci_detalle_url",
              "ci_ejecutado_en", "ci_actualizado_en"
         from "entrega" where "id" = ?`,
      [entregaId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.ci_resultado_nombre).toBe("sin_consultar");
    expect(rows[0]!.ci_check_suite_ids).toEqual([]);
    expect(rows[0]!.ci_commit_sha).toBeNull();
    expect(rows[0]!.ci_detalle_url).toBeNull();
    expect(rows[0]!.ci_ejecutado_en).toBeNull();
    expect(rows[0]!.ci_actualizado_en).toBeNull();
  });

  it("una entrega nueva insertada después de la migración también nace en 'sin_consultar'", async () => {
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();
    const entregaId = randomUUID();

    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2027, ?, false, '{}'::jsonb)`,
      [comisionId, `sheet-${comisionId}`]
    );
    await insertAssignmentLegacy(connection, { id: assignmentId, comisionId });
    await connection.execute(
      `insert into "entrega"
        ("id", "assignment_id", "github_usernames", "repo_name", "repo_url",
         "repo_deleted", "created_at")
       values (?, ?, '{"ana"}', ?, ?, false, now())`,
      [entregaId, assignmentId, `tp-ana-${entregaId}`, "https://github.com/org/repo2"]
    );

    const rows = await connection.execute<{ ci_resultado_nombre: string }[]>(
      `select "ci_resultado_nombre" from "entrega" where "id" = ?`,
      [entregaId]
    );
    expect(rows[0]!.ci_resultado_nombre).toBe("sin_consultar");
  });

  it("el check constraint rechaza un ci_resultado_nombre desconocido", async () => {
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();
    const entregaId = randomUUID();

    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2028, ?, false, '{}'::jsonb)`,
      [comisionId, `sheet-${comisionId}`]
    );
    await insertAssignmentLegacy(connection, { id: assignmentId, comisionId });

    await expect(
      connection.execute(
        `insert into "entrega"
          ("id", "assignment_id", "github_usernames", "repo_name", "repo_url",
           "repo_deleted", "created_at", "ci_resultado_nombre")
         values (?, ?, '{"invalido"}', ?, ?, false, now(), 'no_existe')`,
        [entregaId, assignmentId, `tp-invalido-${entregaId}`, "https://github.com/org/repo3"]
      )
    ).rejects.toThrow();
  });

  it("no agrega ninguna foreign key nueva", async () => {
    const connection = orm.em.getConnection();
    const foreignKeys = await connection.execute<{ constraint_name: string }[]>(
      `select constraint_name from information_schema.table_constraints
         where table_schema = 'public' and table_name = 'entrega'
           and constraint_type = 'FOREIGN KEY'`
    );
    // Las FKs preexistentes de entrega (assignment, alumno, grupo) siguen
    // ahí, pero ninguna nueva de CI — las columnas son escalares.
    expect(foreignKeys.some((fk) => fk.constraint_name.includes("ci_"))).toBe(false);
  });

  it("las entidades no divergen del esquema aplicado por la migración", async () => {
    const { up } = await orm.getSchemaGenerator().getUpdateSchemaMigrationSQL();
    expect(up).not.toContain('"ci_resultado_nombre"');
    expect(up).not.toContain('"ci_check_suite_ids"');
    expect(up).not.toContain('"ci_detalle_url"');
  });

  it("down() elimina las columnas de CI", async () => {
    await orm.getMigrator().down({ migrations: [CI_MIGRATION] });

    const connection = orm.em.getConnection();
    const columns = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'entrega'
           and column_name like 'ci\\_%' escape '\\'`
    );
    expect(columns).toEqual([]);

    // deja la DB como la encontró para no afectar otros tests del archivo
    await orm.getMigrator().up({ to: CI_MIGRATION });
  });
});
