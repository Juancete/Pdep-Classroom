import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Entrega,
  EntregaNoEncontradaError,
  EntregaConProvisionEnCursoError,
  type Assignment,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetEntregaPorId = vi.fn();
const mockEliminarEntrega = vi.fn();
const mockBorrarRepositorio = vi.fn();
const mockGetRepoInfo = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  getEntregaPorId: (entregaId: string) => mockGetEntregaPorId(entregaId),
  eliminarEntrega: (entregaId: string) => mockEliminarEntrega(entregaId),
}));

vi.mock("./borrarRepositoriosDeAssignment", () => ({
  borrarRepositorio: (data: unknown) => mockBorrarRepositorio(data),
}));

// `borrarEntrega.ts` importa `RepositorioPreexistenteNoAdministradoError`
// directo de `./aceptarAssignment` — se mockea acá `@/infrastructure/github`
// (que ese módulo también importa) para que cargarlo no dispare llamadas
// reales; el resto de sus dependencias quedan `undefined` sin problema
// porque nunca se invoca `aceptarAssignment()` en este archivo.
vi.mock("@/infrastructure/github", () => ({
  getRepoInfo: (repoName: string) => mockGetRepoInfo(repoName),
}));

import { borrarEntrega } from "./borrarEntrega";
import { RepositorioPreexistenteNoAdministradoError } from "./aceptarAssignment";

// ── Helpers ──────────────────────────────────────────────────

function makeEntregaConRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    assignment: { id: "a1" },
    repoName: "kata-funcional-usuario1",
    hasRepo: () => true,
    provisionEnCurso: () => false,
    ...overrides,
  };
}

function makeEntregaSinRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    assignment: { id: "a1" },
    hasRepo: () => false,
    provisionEnCurso: () => false,
    ...overrides,
  };
}

// Provisión "fallida" (o "pendiente" vencida) con `repoName` asignado pero
// sin repo activo — el caso que motivó la Spec 1: puede haber un repo
// huérfano en GitHub que `hasRepo()` no ve.
function makeEntregaFallida(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    assignment: { id: "a1" },
    repoName: "kata-funcional-usuario1",
    hasRepo: () => false,
    provisionEnCurso: () => false,
    repoFueBorrado: () => false,
    reconoceComoPropio: () => false,
    ...overrides,
  };
}

describe("borrarEntrega", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEliminarEntrega.mockResolvedValue(undefined);
  });

  it("lanza EntregaConProvisionEnCursoError si la provisión está en vuelo y no toca GitHub ni la fila", async () => {
    mockGetEntregaPorId.mockResolvedValue(
      makeEntregaFallida({ provisionEnCurso: () => true })
    );

    await expect(
      borrarEntrega({ assignmentId: "a1", entregaId: "e1", requestedBy: "docente" })
    ).rejects.toThrow(EntregaConProvisionEnCursoError);

    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(mockBorrarRepositorio).not.toHaveBeenCalled();
    expect(mockEliminarEntrega).not.toHaveBeenCalled();
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

  describe("entrega con provisión fallida (sin hasRepo(), pero con repoName)", () => {
    it("cuyo repo existe y es propio: borra el repo y la fila", async () => {
      // Entrega real (no un stub) para ejercitar el `reconoceComoPropio` de
      // verdad: el repo se reconoce por el marcador embebido en la
      // descripción, con un `createdAt` posterior a que arrancó la creación.
      const entrega = new Entrega();
      entrega.id = "e1";
      entrega.assignment = { id: "a1" } as Assignment;
      entrega.repoName = "kata-funcional-usuario1";
      entrega.provisionEstado = "fallida";
      entrega.repoDeleted = false;
      entrega.marcarCreacionGithubIniciada();
      mockGetEntregaPorId.mockResolvedValue(entrega);
      mockGetRepoInfo.mockResolvedValue({
        repoGithubId: "555",
        repoUrl: "https://github.com/org/kata-funcional-usuario1",
        description: `Kata Funcional — PdeP ${entrega.marcadorDeRepo()}`,
        createdAt: new Date(Date.now() + 1_000),
      });
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
      expect(mockGetRepoInfo).toHaveBeenCalledWith("kata-funcional-usuario1");
      expect(mockBorrarRepositorio).toHaveBeenCalledWith(
        expect.objectContaining({ entrega, assignmentId: "a1", requestedBy: "docente" })
      );
      expect(mockEliminarEntrega).toHaveBeenCalledWith("e1");
    });

    it("cuyo repo no existe en GitHub: borra sólo la fila", async () => {
      mockGetEntregaPorId.mockResolvedValue(makeEntregaFallida());
      mockGetRepoInfo.mockResolvedValue(null);

      const result = await borrarEntrega({
        assignmentId: "a1",
        entregaId: "e1",
        requestedBy: "docente",
      });

      expect(result).toEqual({ ok: true, repo: "sin-repo" });
      expect(mockBorrarRepositorio).not.toHaveBeenCalled();
      expect(mockEliminarEntrega).toHaveBeenCalledWith("e1");
    });

    it("cuyo repo existe pero no es propio: lanza RepositorioPreexistenteNoAdministradoError y no borra nada", async () => {
      mockGetEntregaPorId.mockResolvedValue(
        makeEntregaFallida({ reconoceComoPropio: () => false })
      );
      mockGetRepoInfo.mockResolvedValue({
        repoGithubId: "999",
        repoUrl: "https://github.com/org/kata-funcional-usuario1",
        description: null,
        createdAt: new Date(),
      });

      await expect(
        borrarEntrega({ assignmentId: "a1", entregaId: "e1", requestedBy: "docente" })
      ).rejects.toThrow(RepositorioPreexistenteNoAdministradoError);

      expect(mockBorrarRepositorio).not.toHaveBeenCalled();
      expect(mockEliminarEntrega).not.toHaveBeenCalled();
    });
  });
});
