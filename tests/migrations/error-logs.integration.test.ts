import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";
import {
  acknowledgeErrorLog,
  purgeAcknowledgedErrorLogs,
  registrarErrorInesperado,
} from "../../src/lib/repositories/ErrorLogRepository";

const PREVIOUS_MIGRATION = "Migration20260820120000_webhook_deliveries";
const ERROR_LOG_MIGRATION = "Migration20260821120000_error_logs";

function getSafeTestDatabaseUrl(): string {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!value) throw new Error("MIGRATION_TEST_DATABASE_URL es obligatoria para ejecutar pruebas de migraciones");
  const url = new URL(value);
  if (!url.pathname.slice(1).endsWith("_test")) {
    throw new Error("La base de migraciones debe terminar en _test");
  }
  return value;
}

async function resetPublicSchema(orm: MikroORM): Promise<void> {
  await orm.em.getConnection().execute('drop schema if exists "public" cascade');
  await orm.em.getConnection().execute('create schema "public"');
}

describe("Migration20260821120000_error_logs", () => {
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
    await orm.getMigrator().up({ to: ERROR_LOG_MIGRATION });
  });

  afterAll(async () => {
    if (!orm) return;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  it("crea la tabla y sus índices operativos", async () => {
    const rows = await orm.em.getConnection().execute<{ indexname: string }[]>(
      `select indexname from pg_indexes where schemaname = 'public' and tablename = 'error_log'`
    );
    expect(rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      "error_log_fingerprint_unique",
      "error_log_route_last_seen_idx",
      "error_log_unread_last_seen_idx",
      "error_log_acknowledged_retention_idx",
    ]));
  });

  it("no pierde incrementos en UPSERTs concurrentes", async () => {
    const fingerprint = randomUUID().replaceAll("-", "").padEnd(64, "f");
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      registrarErrorInesperado({
        route: "GET /api/concurrente",
        message: "falló",
        context: { index },
        fingerprint,
      }, orm.em.fork())
    ));
    const rows = await orm.em.getConnection().execute<{
      count: number;
      first_seen_at: Date;
      last_seen_at: Date;
      acknowledged_at: Date | null;
    }[]>(`select "count", "first_seen_at", "last_seen_at", "acknowledged_at" from "error_log" where "fingerprint" = ?`, [fingerprint]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(20);
    expect(rows[0]!.acknowledged_at).toBeNull();
    expect(rows[0]!.last_seen_at.getTime()).toBeGreaterThanOrEqual(rows[0]!.first_seen_at.getTime());
  });

  it("una recurrencia reactiva un fingerprint reconocido", async () => {
    const fingerprint = "a".repeat(64);
    const firstSeenAt = new Date("2026-08-20T10:00:00Z");
    const lastSeenAt = new Date("2026-08-21T10:00:00Z");
    await registrarErrorInesperado({
      route: "POST /api/reactiva",
      message: "falló",
      context: null,
      fingerprint,
      now: firstSeenAt,
    }, orm.em.fork());
    await orm.em.getConnection().execute(`update "error_log" set "acknowledged_at" = now() where "fingerprint" = ?`, [fingerprint]);
    await registrarErrorInesperado({
      route: "POST /api/reactiva",
      message: "falló otra vez",
      context: { intento: 2 },
      fingerprint,
      now: lastSeenAt,
    }, orm.em.fork());
    const rows = await orm.em.getConnection().execute<{
      count: number;
      acknowledged_at: Date | null;
      context: unknown;
      first_seen_at: Date;
      last_seen_at: Date;
    }[]>(
      `select "count", "acknowledged_at", "context", "first_seen_at", "last_seen_at" from "error_log" where "fingerprint" = ?`,
      [fingerprint]
    );
    expect(rows[0]).toMatchObject({ count: 2, acknowledged_at: null, context: { intento: 2 } });
    expect(rows[0]!.first_seen_at).toEqual(firstSeenAt);
    expect(rows[0]!.last_seen_at).toEqual(lastSeenAt);
  });

  it("garantiza idempotencia exacta ante reconocimientos concurrentes", async () => {
    const fingerprint = "d".repeat(64);
    await registrarErrorInesperado({
      route: "PATCH /api/reconocer",
      message: "falló",
      context: null,
      fingerprint,
    }, orm.em.fork());
    const [{ id }] = await orm.em.getConnection().execute<{ id: string }[]>(
      `select "id" from "error_log" where "fingerprint" = ?`,
      [fingerprint]
    );

    const results = await Promise.all([
      acknowledgeErrorLog(id, new Date(), orm.em.fork()),
      acknowledgeErrorLog(id, new Date(), orm.em.fork()),
    ]);
    expect(results.sort()).toEqual(["already-acknowledged", "updated"]);
  });

  it("la restricción única rechaza fingerprints duplicados por fuera del UPSERT", async () => {
    const fingerprint = "e".repeat(64);
    const insert = (id: string) => orm.em.getConnection().execute(
      `insert into "error_log" ("id", "route", "message", "fingerprint", "first_seen_at", "last_seen_at") values (?, 'GET /unique', 'x', ?, now(), now())`,
      [id, fingerprint]
    );
    await insert(randomUUID());
    await expect(insert(randomUUID())).rejects.toThrow(/duplicate key|unique constraint/i);
  });

  it("purga sólo errores reconocidos cuya última aparición venció", async () => {
    const oldAcknowledged = "f".repeat(64);
    const oldUnread = "1".repeat(64);
    const recentAcknowledged = "2".repeat(64);
    const oldDate = new Date("2026-01-01T00:00:00Z");
    const recentDate = new Date("2026-08-01T00:00:00Z");
    for (const [fingerprint, now] of [
      [oldAcknowledged, oldDate],
      [oldUnread, oldDate],
      [recentAcknowledged, recentDate],
    ] as const) {
      await registrarErrorInesperado({
        route: "GET /api/retention",
        message: fingerprint,
        context: null,
        fingerprint,
        now,
      }, orm.em.fork());
    }
    await orm.em.getConnection().execute(
      `update "error_log" set "acknowledged_at" = now() where "fingerprint" in (?, ?)`,
      [oldAcknowledged, recentAcknowledged]
    );

    await expect(
      purgeAcknowledgedErrorLogs(new Date("2026-05-01T00:00:00Z"), orm.em.fork())
    ).resolves.toBe(1);
    const remaining = await orm.em.getConnection().execute<{ fingerprint: string }[]>(
      `select "fingerprint" from "error_log" where "fingerprint" in (?, ?, ?) order by "fingerprint"`,
      [oldAcknowledged, oldUnread, recentAcknowledged]
    );
    expect(remaining.map((row) => row.fingerprint).sort()).toEqual(
      [oldUnread, recentAcknowledged].sort()
    );
  });

  it("rechaza contadores no positivos", async () => {
    await expect(orm.em.getConnection().execute(
      `insert into "error_log" ("id", "route", "message", "fingerprint", "count", "first_seen_at", "last_seen_at") values (?, 'GET /x', 'x', ?, 0, now(), now())`,
      [randomUUID(), "b".repeat(64)]
    )).rejects.toThrow(/check constraint/i);
  });
});
