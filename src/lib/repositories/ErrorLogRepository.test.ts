import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorLog } from "@/domain/entities";

const mockExecute = vi.fn();
const mockCount = vi.fn();
const mockFind = vi.fn();
const mockNativeUpdate = vi.fn();
const mockNativeDelete = vi.fn();
const mockGetEM = vi.fn();

vi.mock("@/lib/db", () => ({ getEM: () => mockGetEM() }));

import {
  acknowledgeAllErrorLogs,
  acknowledgeErrorLog,
  getErrorLogsPage,
  purgeAcknowledgedErrorLogs,
  registrarErrorInesperado,
} from "./ErrorLogRepository";

describe("ErrorLogRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEM.mockResolvedValue({
      getConnection: () => ({ execute: mockExecute }),
      count: mockCount,
      find: mockFind,
      nativeUpdate: mockNativeUpdate,
      nativeDelete: mockNativeDelete,
    });
  });

  it("registra con un UPSERT que incrementa y reactiva el fingerprint", async () => {
    const now = new Date("2026-08-21T12:00:00Z");
    await registrarErrorInesperado({
      route: "GET /api/test",
      message: "falló",
      context: { id: "a1" },
      fingerprint: "f".repeat(64),
      now,
    });
    expect(mockExecute).toHaveBeenCalledOnce();
    const [sql, params] = mockExecute.mock.calls[0]!;
    expect(sql).toContain("on conflict");
    expect(sql).toContain('"count" = "error_log"."count" + 1');
    expect(sql).toContain('"acknowledged_at" = null');
    expect(params).toEqual(expect.arrayContaining([
      "GET /api/test", "falló", JSON.stringify({ id: "a1" }), "f".repeat(64), now,
    ]));
  });

  it("pagina, filtra y ordena por última aparición", async () => {
    mockCount.mockResolvedValue(60);
    mockExecute.mockResolvedValue([{ route: "GET /a" }, { route: "POST /b" }]);
    mockFind.mockResolvedValue([]);
    const result = await getErrorLogsPage({ page: 4, route: "GET /a" });
    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(3);
    expect(result.routes).toEqual(["GET /a", "POST /b"]);
    expect(mockFind).toHaveBeenCalledWith(
      ErrorLog,
      { route: "GET /a" },
      expect.objectContaining({ limit: 25, offset: 50 })
    );
  });

  it("reconoce individualmente con un UPDATE condicional atómico", async () => {
    mockExecute.mockResolvedValueOnce([{ id: "e1" }]);
    await expect(acknowledgeErrorLog("e1")).resolves.toBe("updated");
    expect(mockExecute.mock.calls[0]![0]).toContain(
      'where "id" = ? and "acknowledged_at" is null'
    );

    mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "e1" }]);
    await expect(acknowledgeErrorLog("e1")).resolves.toBe("already-acknowledged");

    mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(acknowledgeErrorLog("no")).resolves.toBe("not-found");
  });

  it("reconoce todos y devuelve la cantidad modificada", async () => {
    mockNativeUpdate.mockResolvedValue(8);
    await expect(acknowledgeAllErrorLogs()).resolves.toBe(8);
    expect(mockNativeUpdate).toHaveBeenCalledWith(
      ErrorLog,
      { acknowledgedAt: null },
      { acknowledgedAt: expect.any(Date) }
    );
  });

  it("purga sólo reconocidos anteriores al cutoff", async () => {
    mockNativeDelete.mockResolvedValue(2);
    const cutoff = new Date("2026-05-01T00:00:00Z");
    await expect(purgeAcknowledgedErrorLogs(cutoff)).resolves.toBe(2);
    expect(mockNativeDelete).toHaveBeenCalledWith(ErrorLog, {
      acknowledgedAt: { $ne: null },
      lastSeenAt: { $lt: cutoff },
    });
  });
});
