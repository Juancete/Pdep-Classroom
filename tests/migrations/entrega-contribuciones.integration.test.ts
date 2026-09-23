import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION =
  "Migration20260919120000_add_columna_grupo_en_planilla_to_assignment";
const CONTRIBUCIONES_MIGRATION = "Migration20260922120000_entrega_contribuciones";

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

describe("Migration20260922120000_entrega_contribuciones", () => {
  let orm: MikroORM;
  let legacyEntregaId: string;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig,
      clientUrl: getSafeTestDatabaseUrl(),
      debug: false,
      migrations: { ...ormConfig.migrations, snapshot: false },
    });
    await resetPublicSchema(orm);
    await orm.getMigrator().up({ to: PREVIOUS_MIGRATION });

    // Entrega "legacy", insertada ANTES de aplicar la migración de
    // contribuciones — deja el escenario de backfill armado en el setup,
    // igual que en `ci-estado.integration.test.ts`.
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    const assignmentId = randomUUID();
    legacyEntregaId = randomUUID();
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
      [legacyEntregaId, assignmentId, `tp-juancito-${legacyEntregaId}`, "https://github.com/org/repo"]
    );

    await orm.getMigrator().up({ to: CONTRIBUCIONES_MIGRATION });
  });

  afterAll(async () => {
    if (!orm) return;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it("una entrega legacy queda en null (nunca sincronizada)", async () => {
    const connection = orm.em.getConnection();
    const rows = await connection.execute<
      { contribuciones: unknown; contribuciones_actualizado_en: Date | null }[]
    >(
      `select "contribuciones", "contribuciones_actualizado_en"
         from "entrega" where "id" = ?`,
      [legacyEntregaId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.contribuciones).toBeNull();
    expect(rows[0]!.contribuciones_actualizado_en).toBeNull();
  });

  it("un update con jsonb se lee de vuelta como array", async () => {
    const connection = orm.em.getConnection();
    await connection.execute(
      `update "entrega"
         set "contribuciones" = ?::jsonb, "contribuciones_actualizado_en" = now()
       where "id" = ?`,
      [JSON.stringify([{ login: "juancito", commits: 5 }]), legacyEntregaId]
    );

    const rows = await connection.execute<
      { contribuciones: { login: string; commits: number }[] }[]
    >(`select "contribuciones" from "entrega" where "id" = ?`, [legacyEntregaId]);

    expect(rows[0]!.contribuciones).toEqual([{ login: "juancito", commits: 5 }]);
  });

  it("las entidades no divergen del esquema aplicado por la migración", async () => {
    const { up } = await orm.getSchemaGenerator().getUpdateSchemaMigrationSQL();
    expect(up).not.toContain('"contribuciones"');
    expect(up).not.toContain('"contribuciones_actualizado_en"');
  });

  it("down() elimina las columnas y up() las vuelve a crear", async () => {
    await orm.getMigrator().down({ migrations: [CONTRIBUCIONES_MIGRATION] });

    const connection = orm.em.getConnection();
    const columnasLuegoDeDown = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'entrega'
           and column_name like 'contribuciones%'`
    );
    expect(columnasLuegoDeDown).toEqual([]);

    await orm.getMigrator().up({ to: CONTRIBUCIONES_MIGRATION });

    const columnasLuegoDeUp = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'entrega'
           and column_name like 'contribuciones%'
         order by column_name`
    );
    expect(columnasLuegoDeUp.map((columna) => columna.column_name)).toEqual([
      "contribuciones",
      "contribuciones_actualizado_en",
    ]);
  });
});
