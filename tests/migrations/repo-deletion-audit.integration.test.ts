import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION =
  "Migration20260813190000_group_membership_invariants";
const AUDIT_MIGRATION = "Migration20260814140000_repo_deletion_audit";

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

describe("Migration20260814140000_repo_deletion_audit", () => {
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

  it("persiste la auditoría aunque luego se borren assignment y entrega", async () => {
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();
    const entregaId = randomUUID();
    const attemptId = randomUUID();
    const operationId = randomUUID();

    await connection.execute(
      `insert into "comision"
        ("id", "anio", "spreadsheet_id", "activa", "column_config")
       values (?, 2026, ?, false, '{}'::jsonb)`,
      [comisionId, `sheet-${comisionId}`]
    );
    await connection.execute(
      `insert into "assignment"
        ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
         "created_at", "comision_id", "inscripciones_cerradas")
       values (?, 'TP auditado', ?, 'org/template', 'funcional', 'individual',
         now(), ?, false)`,
      [assignmentId, `tp-${assignmentId}`, comisionId]
    );
    await connection.execute(
      `insert into "entrega"
        ("id", "assignment_id", "github_usernames", "repo_name", "repo_url",
         "created_at", "repo_deleted")
       values (?, ?, '{}', 'tp-auditado', 'https://github.com/org/tp-auditado',
         now(), false)`,
      [entregaId, assignmentId]
    );

    await orm.getMigrator().up({ to: AUDIT_MIGRATION });
    await connection.execute(
      `insert into "repo_deletion_attempt"
        ("id", "operation_id", "assignment_id", "entrega_id", "repo_name",
         "requested_by", "status", "started_at")
       values (?, ?, ?, ?, 'tp-auditado', 'docente', 'pending', now())`,
      [attemptId, operationId, assignmentId, entregaId]
    );

    await expect(
      connection.execute(
        `update "repo_deletion_attempt" set "status" = 'desconocido' where "id" = ?`,
        [attemptId]
      )
    ).rejects.toThrow();

    await connection.execute('delete from "assignment" where "id" = ?', [
      assignmentId,
    ]);
    const rows = await connection.execute<
      { assignment_id: string; entrega_id: string; status: string }[]
    >(
      `select "assignment_id", "entrega_id", "status"
         from "repo_deletion_attempt" where "id" = ?`,
      [attemptId]
    );
    expect(rows).toEqual([
      { assignment_id: assignmentId, entrega_id: entregaId, status: "pending" },
    ]);

    const { up } = await orm.getSchemaGenerator().getUpdateSchemaMigrationSQL();
    expect(up).not.toContain('"repo_deletion_attempt"');

    await orm.getMigrator().down({ migrations: [AUDIT_MIGRATION] });
    const tables = await connection.execute<{ table_name: string }[]>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name = 'repo_deletion_attempt'`
    );
    expect(tables).toEqual([]);
  });
});
