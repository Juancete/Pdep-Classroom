import { randomUUID } from "node:crypto";
import { QueryOrder } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { ErrorLog } from "@/domain/entities";
import { getEM } from "@/lib/db";

export const ERROR_LOG_RETENTION_DAYS = 90;
export const ERROR_LOG_PAGE_SIZE = 25;

export type ErrorLogPage = {
  items: ErrorLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  routes: string[];
};

export async function registrarErrorInesperado(input: {
  route: string;
  message: string;
  context: Record<string, unknown> | null;
  fingerprint: string;
  now?: Date;
}, entityManagerOverride?: EntityManager): Promise<void> {
  const entityManager = entityManagerOverride ?? await getEM();
  const now = input.now ?? new Date();
  await entityManager.getConnection().execute(
    `insert into "error_log"
      ("id", "route", "message", "context", "fingerprint", "count", "first_seen_at", "last_seen_at", "acknowledged_at")
     values (?, ?, ?, ?::jsonb, ?, 1, ?, ?, null)
     on conflict ("fingerprint") do update set
       "route" = excluded."route",
       "message" = excluded."message",
       "context" = excluded."context",
       "count" = "error_log"."count" + 1,
       "last_seen_at" = excluded."last_seen_at",
       "acknowledged_at" = null`,
    [
      randomUUID(),
      input.route,
      input.message,
      input.context === null ? null : JSON.stringify(input.context),
      input.fingerprint,
      now,
      now,
    ]
  );
}

export async function getErrorLogsPage(input: {
  page: number;
  pageSize?: number;
  route?: string;
}): Promise<ErrorLogPage> {
  const entityManager = await getEM();
  const pageSize = input.pageSize ?? ERROR_LOG_PAGE_SIZE;
  const where = input.route ? { route: input.route } : {};
  const [total, routeRows] = await Promise.all([
    entityManager.count(ErrorLog, where),
    entityManager.getConnection().execute<{ route: string }[]>(
      `select distinct "route" from "error_log" order by "route" asc`
    ),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, input.page), totalPages);
  const items = await entityManager.find(ErrorLog, where, {
    orderBy: { lastSeenAt: QueryOrder.DESC, id: QueryOrder.DESC },
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return { items, page, pageSize, total, totalPages, routes: routeRows.map((row) => row.route) };
}

export async function getUnreadErrorLogCount(): Promise<number> {
  const entityManager = await getEM();
  return entityManager.count(ErrorLog, { acknowledgedAt: null });
}

export async function acknowledgeErrorLog(
  id: string,
  now = new Date(),
  entityManagerOverride?: EntityManager
): Promise<"updated" | "already-acknowledged" | "not-found"> {
  const entityManager = entityManagerOverride ?? await getEM();
  const connection = entityManager.getConnection();
  const updated = await connection.execute<{ id: string }[]>(
    `update "error_log"
        set "acknowledged_at" = ?
      where "id" = ? and "acknowledged_at" is null
      returning "id"`,
    [now, id]
  );
  if (updated.length > 0) return "updated";

  const existing = await connection.execute<{ id: string }[]>(
    `select "id" from "error_log" where "id" = ?`,
    [id]
  );
  return existing.length > 0 ? "already-acknowledged" : "not-found";
}

export async function acknowledgeAllErrorLogs(now = new Date()): Promise<number> {
  const entityManager = await getEM();
  const result = await entityManager.nativeUpdate(
    ErrorLog,
    { acknowledgedAt: null },
    { acknowledgedAt: now }
  );
  return result;
}

export async function purgeAcknowledgedErrorLogs(
  cutoff: Date,
  entityManagerOverride?: EntityManager
): Promise<number> {
  const entityManager = entityManagerOverride ?? await getEM();
  return entityManager.nativeDelete(ErrorLog, {
    acknowledgedAt: { $ne: null },
    lastSeenAt: { $lt: cutoff },
  });
}
