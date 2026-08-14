import { beforeEach, describe, expect, it, vi } from "vitest";
import { Entrega } from "@/domain/entities";

const mockDeleteRepo = vi.fn();
const mockGetActive = vi.fn();
const mockStart = vi.fn();
const mockComplete = vi.fn();
const mockFail = vi.fn();

vi.mock("@/lib/github", () => ({
  deleteRepo: (repoName: string) => mockDeleteRepo(repoName),
}));

vi.mock("@/lib/repositories", () => ({
  getEntregasConRepoActivo: (assignmentId: string) => mockGetActive(assignmentId),
  iniciarIntentoBorradoRepo: (data: unknown) => mockStart(data),
  completarIntentoBorradoRepo: (data: unknown) => mockComplete(data),
  fallarIntentoBorradoRepo: (attemptId: string, error: string) =>
    mockFail(attemptId, error),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { borrarRepositoriosDeAssignment } from "./borrarRepositoriosDeAssignment";

function entrega(index: number): Entrega {
  const item = new Entrega();
  item.id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  item.repoName = `tp-alumno-${index}`;
  item.repoUrl = `https://github.com/org/tp-alumno-${index}`;
  return item;
}

describe("borrarRepositoriosDeAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActive.mockResolvedValue([]);
    mockStart.mockImplementation(async (data: { entregaId: string }) => ({
      id: `attempt-${data.entregaId}`,
    }));
    mockDeleteRepo.mockResolvedValue("deleted");
    mockComplete.mockResolvedValue(undefined);
    mockFail.mockResolvedValue(undefined);
  });

  it("devuelve un resultado vacío sin crear una operación", async () => {
    await expect(
      borrarRepositoriosDeAssignment({
        assignmentId: "a1",
        requestedBy: "docente",
      })
    ).resolves.toEqual({
      ok: true,
      operationId: null,
      attempted: 0,
      deleted: 0,
      alreadyAbsent: 0,
      failed: 0,
      results: [],
    });
  });

  it("registra cada intento antes de borrar y resume los éxitos", async () => {
    const entregas = [entrega(1), entrega(2)];
    mockGetActive.mockResolvedValue(entregas);
    mockDeleteRepo
      .mockResolvedValueOnce("deleted")
      .mockResolvedValueOnce("already_absent");

    const result = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });

    expect(result).toMatchObject({
      ok: true,
      attempted: 2,
      deleted: 1,
      alreadyAbsent: 1,
      failed: 0,
    });
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStart.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteRepo.mock.invocationCallOrder[0]!
    );
    expect(mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "already_absent" })
    );
  });

  it("persiste el fallo y deja el repo disponible para reintento", async () => {
    mockGetActive.mockResolvedValue([entrega(1)]);
    mockDeleteRepo.mockRejectedValue(new Error("GitHub no disponible"));

    const result = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });

    expect(result).toMatchObject({ ok: false, failed: 1, deleted: 0 });
    expect(mockFail).toHaveBeenCalledWith(
      expect.any(String),
      "GitHub no disponible"
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("redacta credenciales antes de persistirlas o devolverlas", async () => {
    mockGetActive.mockResolvedValue([entrega(1)]);
    mockDeleteRepo.mockRejectedValue(
      new Error("GitHub rechazó token=github_pat_secreto123")
    );

    const result = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });

    expect(result.results[0]?.error).toBe(
      "GitHub rechazó token=[REDACTED]"
    );
    expect(mockFail).toHaveBeenCalledWith(
      expect.any(String),
      "GitHub rechazó token=[REDACTED]"
    );
  });

  it("no toca GitHub si no puede iniciar la auditoría", async () => {
    mockGetActive.mockResolvedValue([entrega(1)]);
    mockStart.mockRejectedValue(new Error("DB caída"));

    const result = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });

    expect(result.failed).toBe(1);
    expect(mockDeleteRepo).not.toHaveBeenCalled();
  });

  it("reporta un resultado incierto si GitHub respondió pero falla la persistencia", async () => {
    mockGetActive.mockResolvedValue([entrega(1)]);
    mockComplete.mockRejectedValue(new Error("DB caída"));

    const result = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });

    expect(result.results[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("no se pudo guardar"),
    });
    expect(mockFail).not.toHaveBeenCalled();
  });

  it("un reintento converge cuando GitHub informa que el repo ya no existe", async () => {
    const item = entrega(1);
    mockGetActive
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([item]);
    mockDeleteRepo
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("already_absent");

    const first = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });
    const retry = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });

    expect(first.failed).toBe(1);
    expect(retry).toMatchObject({ ok: true, alreadyAbsent: 1, failed: 0 });
  });

  it("limita a cinco los borrados simultáneos", async () => {
    mockGetActive.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => entrega(index + 1))
    );
    let active = 0;
    let maxActive = 0;
    mockDeleteRepo.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active -= 1;
      return "deleted";
    });

    const result = await borrarRepositoriosDeAssignment({
      assignmentId: "a1",
      requestedBy: "docente",
    });

    expect(result).toMatchObject({ ok: true, deleted: 12 });
    expect(maxActive).toBe(5);
  });
});
