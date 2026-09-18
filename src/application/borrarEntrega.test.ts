import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntregaNoEncontradaError } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetEntregaPorId = vi.fn();
const mockEliminarEntrega = vi.fn();
const mockBorrarRepositorio = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  getEntregaPorId: (entregaId: string) => mockGetEntregaPorId(entregaId),
  eliminarEntrega: (entregaId: string) => mockEliminarEntrega(entregaId),
}));

vi.mock("./borrarRepositoriosDeAssignment", () => ({
  borrarRepositorio: (data: unknown) => mockBorrarRepositorio(data),
}));

import { borrarEntrega } from "./borrarEntrega";

// ── Helpers ──────────────────────────────────────────────────

function makeEntregaConRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    assignment: { id: "a1" },
    repoName: "kata-funcional-usuario1",
    hasRepo: () => true,
    ...overrides,
  };
}

function makeEntregaSinRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    assignment: { id: "a1" },
    hasRepo: () => false,
    ...overrides,
  };
}

describe("borrarEntrega", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEliminarEntrega.mockResolvedValue(undefined);
  });

  it("lanza EntregaNoEncontradaError si la entrega no existe", async () => {
    mockGetEntregaPorId.mockResolvedValue(null);

    await expect(
      borrarEntrega({ assignmentId: "a1", entregaId: "no-existe", requestedBy: "docente" })
    ).rejects.toThrow(EntregaNoEncontradaError);

    expect(mockBorrarRepositorio).not.toHaveBeenCalled();
    expect(mockEliminarEntrega).not.toHaveBeenCalled();
  });

  it("lanza EntregaNoEncontradaError si la entrega pertenece a otro assignment", async () => {
    mockGetEntregaPorId.mockResolvedValue(
      makeEntregaConRepo({ assignment: { id: "otro-assignment" } })
    );

    await expect(
      borrarEntrega({ assignmentId: "a1", entregaId: "e1", requestedBy: "docente" })
    ).rejects.toThrow(EntregaNoEncontradaError);

    expect(mockBorrarRepositorio).not.toHaveBeenCalled();
    expect(mockEliminarEntrega).not.toHaveBeenCalled();
  });

  it("borra el repo y la fila cuando la entrega tiene un repo activo", async () => {
    const entrega = makeEntregaConRepo();
    mockGetEntregaPorId.mockResolvedValue(entrega);
    mockBorrarRepositorio.mockResolvedValue({
      entregaId: "e1",
      repoName: "kata-funcional-usuario1",
      status: "deleted",
    });

    const result = await borrarEntrega({
      assignmentId: "a1",
      entregaId: "e1",
      requestedBy: "docente",
    });

    expect(result).toEqual({ ok: true, repo: "deleted" });
    expect(mockBorrarRepositorio).toHaveBeenCalledWith(
      expect.objectContaining({ entrega, assignmentId: "a1", requestedBy: "docente" })
    );
    expect(mockEliminarEntrega).toHaveBeenCalledWith("e1");
  });

  it("borra la fila cuando GitHub informa que el repo ya no existía", async () => {
    mockGetEntregaPorId.mockResolvedValue(makeEntregaConRepo());
    mockBorrarRepositorio.mockResolvedValue({
      entregaId: "e1",
      repoName: "kata-funcional-usuario1",
      status: "already_absent",
    });

    const result = await borrarEntrega({
      assignmentId: "a1",
      entregaId: "e1",
      requestedBy: "docente",
    });

    expect(result).toEqual({ ok: true, repo: "already_absent" });
    expect(mockEliminarEntrega).toHaveBeenCalledWith("e1");
  });

  it("borra sólo la fila cuando la entrega no tiene repo", async () => {
    mockGetEntregaPorId.mockResolvedValue(makeEntregaSinRepo());

    const result = await borrarEntrega({
      assignmentId: "a1",
      entregaId: "e1",
      requestedBy: "docente",
    });

    expect(result).toEqual({ ok: true, repo: "sin-repo" });
    expect(mockBorrarRepositorio).not.toHaveBeenCalled();
    expect(mockEliminarEntrega).toHaveBeenCalledWith("e1");
  });

  it("no borra la fila si el borrado del repo falla en GitHub", async () => {
    mockGetEntregaPorId.mockResolvedValue(makeEntregaConRepo());
    mockBorrarRepositorio.mockResolvedValue({
      entregaId: "e1",
      repoName: "kata-funcional-usuario1",
      status: "failed",
      error: "GitHub no disponible",
    });

    const result = await borrarEntrega({
      assignmentId: "a1",
      entregaId: "e1",
      requestedBy: "docente",
    });

    expect(result).toEqual({ ok: false, error: "GitHub no disponible" });
    expect(mockEliminarEntrega).not.toHaveBeenCalled();
  });
});
