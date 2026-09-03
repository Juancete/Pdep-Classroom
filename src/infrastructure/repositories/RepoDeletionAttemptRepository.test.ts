import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryOrder } from "@mikro-orm/core";

const mockTx = {
  findOneOrFail: vi.fn(),
  flush: vi.fn(),
  getConnection: vi.fn(),
};
const mockExecute = vi.fn();

const mockEm = {
  persist: vi.fn(),
  flush: vi.fn(),
  findOneOrFail: vi.fn(),
  count: vi.fn(),
  find: vi.fn(),
  transactional: vi.fn(async (callback: (transaction: typeof mockTx) => unknown) =>
    callback(mockTx)
  ),
};

vi.mock("@/infrastructure/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

import { Entrega, RepoDeletionAttempt } from "@/domain/entities";
import {
  conLockBorradoReposAssignment,
  completarIntentoBorradoRepo,
  fallarIntentoBorradoRepo,
  getRepoDeletionHistory,
  iniciarIntentoBorradoRepo,
} from "./RepoDeletionAttemptRepository";

describe("RepoDeletionAttemptRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEm.flush.mockResolvedValue(undefined);
    mockTx.flush.mockResolvedValue(undefined);
    mockTx.getConnection.mockReturnValue({ execute: mockExecute });
    mockEm.transactional.mockImplementation(
      async (callback: (transaction: typeof mockTx) => unknown) => callback(mockTx)
    );
  });

  it("mantiene un lock transaccional durante la operación de un assignment", async () => {
    mockExecute.mockResolvedValue(undefined);
    const operation = vi.fn(async () => "resultado");

    await expect(
      conLockBorradoReposAssignment("a1", operation)
    ).resolves.toBe("resultado");

    expect(mockExecute).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtextextended(?, 0))",
      ["repo-deletion:a1"]
    );
    expect(mockExecute.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0]!
    );
  });

  it("usa una clave distinta para cada assignment", async () => {
    mockExecute.mockResolvedValue(undefined);

    await conLockBorradoReposAssignment("a1", async () => undefined);
    await conLockBorradoReposAssignment("a2", async () => undefined);

    expect(mockExecute).toHaveBeenNthCalledWith(1, expect.any(String), [
      "repo-deletion:a1",
    ]);
    expect(mockExecute).toHaveBeenNthCalledWith(2, expect.any(String), [
      "repo-deletion:a2",
    ]);
  });

  it("crea un intento pendiente con actor y contexto completo", async () => {
    const attempt = await iniciarIntentoBorradoRepo({
      operationId: "00000000-0000-4000-8000-000000000001",
      assignmentId: "00000000-0000-4000-8000-000000000002",
      entregaId: "00000000-0000-4000-8000-000000000003",
      repoName: "tp-ana",
      requestedBy: "docente",
    });

    expect(attempt).toMatchObject({
      repoName: "tp-ana",
      requestedBy: "docente",
      status: "pending",
    });
    expect(mockEm.persist).toHaveBeenCalledWith(attempt);
    expect(mockEm.flush).toHaveBeenCalled();
  });

  it.each(["deleted", "already_absent"] as const)(
    "finaliza %s y marca la entrega como borrada en una transacción",
    async (status) => {
      const attempt = new RepoDeletionAttempt();
      const entrega = new Entrega();
      entrega.repoDeleted = false;
      mockTx.findOneOrFail
        .mockResolvedValueOnce(attempt)
        .mockResolvedValueOnce(entrega);

      await completarIntentoBorradoRepo({
        attemptId: "attempt-1",
        entregaId: "entrega-1",
        status,
      });

      expect(attempt.status).toBe(status);
      expect(attempt.completedAt).toBeInstanceOf(Date);
      expect(entrega.repoDeleted).toBe(true);
      expect(mockTx.flush).toHaveBeenCalled();
    }
  );

  it("registra el fallo sin modificar la entrega", async () => {
    const attempt = new RepoDeletionAttempt();
    mockEm.findOneOrFail.mockResolvedValue(attempt);

    await fallarIntentoBorradoRepo("attempt-1", "GitHub caído");

    expect(attempt).toMatchObject({
      status: "failed",
      error: "GitHub caído",
    });
    expect(attempt.completedAt).toBeInstanceOf(Date);
    expect(mockEm.flush).toHaveBeenCalled();
  });

  it("pagina el historial, ordena lo más reciente primero y ajusta páginas excedidas", async () => {
    const attempts = [new RepoDeletionAttempt()];
    mockEm.count.mockResolvedValue(51);
    mockEm.find.mockResolvedValue(attempts);

    const page = await getRepoDeletionHistory("a1", 99, 25);

    expect(page).toEqual({
      items: attempts,
      page: 3,
      pageSize: 25,
      total: 51,
      totalPages: 3,
    });
    expect(mockEm.find).toHaveBeenCalledWith(
      RepoDeletionAttempt,
      { assignmentId: "a1" },
      {
        orderBy: { startedAt: QueryOrder.DESC, id: QueryOrder.DESC },
        limit: 25,
        offset: 50,
      }
    );
  });
});
