import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const PREVIOUS_MIGRATION = "Migration20260819120000_ci_estado";
const WEBHOOK_MIGRATION = "Migration20260820120000_webhook_deliveries";

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

describe("Migration20260820120000_webhook_deliveries", () => {
  let orm: MikroORM;
  let legacyEntregaId: string;
  let assignmentId: string;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig,
      clientUrl: getSafeTestDatabaseUrl(),
      debug: false,
      migrations: { ...ormConfig.migrations, snapshot: false },
    });
    await resetPublicSchema(orm);
    await orm.getMigrator().up({ to: PREVIOUS_MIGRATION });

    // Entrega "legacy", insertada ANTES de aplicar la migración de webhooks
    // — deja el escenario de backfill armado en el setup, para que el orden
    // de los tests (o correr uno solo con `it.only`) no cambie el resultado.
    const connection = orm.em.getConnection();
    const comisionId = randomUUID();
    assignmentId = randomUUID();
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

    await orm.getMigrator().up({ to: WEBHOOK_MIGRATION });
  });

  afterAll(async () => {
    if (!orm) return;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it("backfillea las entregas existentes con la actividad reciente y repo_github_id en null", async () => {
    const connection = orm.em.getConnection();
    const rows = await connection.execute<
      {
        ultimo_push_en: Date | null;
        ultimo_push_sha: string | null;
        ultimo_push_por: string | null;
        repo_github_id: string | null;
        repo_evento_actualizado_en: Date | null;
      }[]
    >(
      `select "ultimo_push_en", "ultimo_push_sha", "ultimo_push_por",
              "repo_github_id", "repo_evento_actualizado_en"
         from "entrega" where "id" = ?`,
      [legacyEntregaId]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.ultimo_push_en).toBeNull();
    expect(rows[0]!.ultimo_push_sha).toBeNull();
    expect(rows[0]!.ultimo_push_por).toBeNull();
    expect(rows[0]!.repo_github_id).toBeNull();
    expect(rows[0]!.repo_evento_actualizado_en).toBeNull();
  });

  it("el índice único rechaza un delivery_id repetido", async () => {
    const connection = orm.em.getConnection();
    const deliveryId = `delivery-${randomUUID()}`;

    await connection.execute(
      `insert into "github_webhook_delivery" ("id", "delivery_id", "evento", "recibido_en")
       values (?, ?, 'push', now())`,
      [randomUUID(), deliveryId]
    );

    await expect(
      connection.execute(
        `insert into "github_webhook_delivery" ("id", "delivery_id", "evento", "recibido_en")
         values (?, ?, 'push', now())`,
        [randomUUID(), deliveryId]
      )
      // Verifica específicamente el rechazo por índice único (no cualquier
      // error) — el mensaje de Postgres incluye este texto.
    ).rejects.toThrow(/duplicate key|unique constraint/i);
  });

  it("el índice único impide asociar el mismo repo de GitHub a dos entregas", async () => {
    const connection = orm.em.getConnection();
    const repoGithubId = String(Date.now());
    await connection.execute(
      `update "entrega" set "repo_github_id" = ? where "id" = ?`,
      [repoGithubId, legacyEntregaId]
    );

    await expect(
      connection.execute(
        `insert into "entrega"
          ("id", "assignment_id", "github_usernames", "repo_name", "repo_url",
           "repo_deleted", "repo_github_id", "created_at")
         values (?, ?, '{}', ?, ?, false, ?, now())`,
        [
          randomUUID(),
          assignmentId,
          `otro-repo-${randomUUID()}`,
          "https://github.com/org/otro-repo",
          repoGithubId,
        ]
      )
    ).rejects.toThrow(/duplicate key|unique constraint/i);
  });

  it("el check constraint rechaza un estado_procesamiento desconocido", async () => {
    const connection = orm.em.getConnection();

    await expect(
      connection.execute(
        `insert into "github_webhook_delivery"
          ("id", "delivery_id", "evento", "estado_procesamiento", "recibido_en")
         values (?, ?, 'push', 'no_existe', now())`,
        [randomUUID(), `delivery-${randomUUID()}`]
      )
    ).rejects.toThrow(/violat(es|ing).*check constraint/i);
  });

  function reclamar(
    connection: ReturnType<MikroORM["em"]["getConnection"]>,
    id: string
  ): Promise<{ id: string }[]> {
    // Copia textual de la query real de `reclamar()` en
    // `GithubWebhookDeliveryRepository.ts` — el lease se mide contra
    // `reclamado_en` (cuándo se ganó ESE reclamo), no `recibido_en` (cuándo
    // se insertó la fila originalmente).
    return connection.execute<{ id: string }[]>(
      `update "github_webhook_delivery"
         set "estado_procesamiento" = 'procesando', "intentos" = "intentos" + 1, "reclamado_en" = now()
         where "id" = ?
           and (
             "estado_procesamiento" in ('recibido', 'fallido')
             or (
               "estado_procesamiento" = 'procesando'
               and "reclamado_en" < now() - (interval '1 millisecond' * ?)
             )
           )
         returning "id"`,
      [id, 120_000]
    );
  }

  it("el reclamo atómico (UPDATE...RETURNING) sólo deja ganar a una de dos llamadas concurrentes sobre la misma fila", async () => {
    const connection = orm.em.getConnection();
    const id = randomUUID();
    const deliveryId = `delivery-${randomUUID()}`;
    await connection.execute(
      `insert into "github_webhook_delivery"
        ("id", "delivery_id", "evento", "estado_procesamiento", "recibido_en", "payload")
       values (?, ?, 'push', 'fallido', now(), ?)`,
      [id, deliveryId, JSON.stringify({ a: 1 })]
    );

    // Dos reclamos "simultáneos" sobre la misma fila fallida — sólo uno
    // puede ganar. Es la garantía real detrás de que un redelivery de
    // GitHub y un reproceso admin no puedan reaplicar el mismo efecto dos
    // veces (issue #60, hallazgo de reclamo atómico).
    const [primero, segundo] = await Promise.all([reclamar(connection, id), reclamar(connection, id)]);
    const ganadores = [primero, segundo].filter((resultado) => resultado.length > 0);
    expect(ganadores).toHaveLength(1);

    const rows = await connection.execute<{ estado_procesamiento: string; intentos: number }[]>(
      `select "estado_procesamiento", "intentos" from "github_webhook_delivery" where "id" = ?`,
      [id]
    );
    expect(rows[0]!.estado_procesamiento).toBe("procesando");
    expect(rows[0]!.intentos).toBe(1);

    await connection.execute(`delete from "github_webhook_delivery" where "id" = ?`, [id]);
  });

  it("un delivery fallido con recibido_en viejo no queda disponible para un segundo reclamo inmediato (el lease usa reclamado_en, no recibido_en)", async () => {
    const connection = orm.em.getConnection();
    const id = randomUUID();
    const deliveryId = `delivery-${randomUUID()}`;
    // `recibido_en` de hace una hora simula un delivery fallido hace rato
    // — exactamente el caso que un reproceso (admin o redelivery) apunta a
    // recuperar. Si el lease se midiera contra `recibido_en`, el segundo
    // reclamo de acá abajo ganaría también (falso huérfano desde el
    // instante cero).
    await connection.execute(
      `insert into "github_webhook_delivery"
        ("id", "delivery_id", "evento", "estado_procesamiento", "recibido_en", "payload")
       values (?, ?, 'push', 'fallido', now() - interval '1 hour', ?)`,
      [id, deliveryId, JSON.stringify({ a: 1 })]
    );

    const primero = await reclamar(connection, id);
    expect(primero).toHaveLength(1);

    const segundoInmediato = await reclamar(connection, id);
    expect(segundoInmediato).toHaveLength(0);

    await connection.execute(`delete from "github_webhook_delivery" where "id" = ?`, [id]);
  });

  it("no agrega ninguna foreign key nueva", async () => {
    const connection = orm.em.getConnection();

    const fkEntrega = await connection.execute<{ constraint_name: string }[]>(
      `select constraint_name from information_schema.table_constraints
         where table_schema = 'public' and table_name = 'entrega'
           and constraint_type = 'FOREIGN KEY'`
    );
    expect(fkEntrega.some((fk) => fk.constraint_name.includes("ultimo_push"))).toBe(false);

    const fkDelivery = await connection.execute<{ constraint_name: string }[]>(
      `select constraint_name from information_schema.table_constraints
         where table_schema = 'public' and table_name = 'github_webhook_delivery'
           and constraint_type = 'FOREIGN KEY'`
    );
    expect(fkDelivery).toEqual([]);
  });

  it("las entidades no divergen del esquema aplicado por la migración", async () => {
    const { up } = await orm.getSchemaGenerator().getUpdateSchemaMigrationSQL();
    expect(up).not.toContain('"github_webhook_delivery"');
    expect(up).not.toContain('"ultimo_push_en"');
    expect(up).not.toContain('"ultimo_push_sha"');
    expect(up).not.toContain('"ultimo_push_por"');
    expect(up).not.toContain('"repo_github_id"');
    expect(up).not.toContain('"repo_evento_actualizado_en"');
  });

  it("down() elimina la tabla de deliveries y las columnas de actividad", async () => {
    await orm.getMigrator().down({ migrations: [WEBHOOK_MIGRATION] });

    const connection = orm.em.getConnection();

    const tabla = await connection.execute<{ table_name: string }[]>(
      `select table_name from information_schema.tables
         where table_schema = 'public' and table_name = 'github_webhook_delivery'`
    );
    expect(tabla).toEqual([]);

    const columnas = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'entrega'
           and column_name like 'ultimo\\_push%' escape '\\'`
    );
    expect(columnas).toEqual([]);

    const columnasRepo = await connection.execute<{ column_name: string }[]>(
      `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'entrega'
           and column_name in ('repo_github_id', 'repo_evento_actualizado_en')`
    );
    expect(columnasRepo).toEqual([]);

    // deja la DB como la encontró para no afectar otros tests del archivo
    await orm.getMigrator().up({ to: WEBHOOK_MIGRATION });
  });
});
