import { beforeEach, describe, expect, it, vi } from "vitest";
import { Entrega } from "@/domain/entities";

const mockGetUltimaEjecucion = vi.fn();
const mockReejecutar = vi.fn();
const mockActualizarAutograding = vi.fn();

vi.mock("@/lib/github", () => ({
  getUltimaEjecucionAutograding: (repoName: string) => mockGetUltimaEjecucion(repoName),
  reejecutarAutograding: (repoName: string, runId: string) => mockReejecutar(repoName, runId),
}));

vi.mock("@/lib/repositories", () => ({
  actualizarAutogradingDeEntrega: (entregaId: string, data: unknown) =>
    mockActualizarAutograding(entregaId, data),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import {
  sincronizarAutogradingDeEntregas,
  reejecutarAutogradingDeEntrega,
} from "./sincronizarAutograding";

function entregaConRepo(
  index: number,
  overrides?: Partial<Pick<Entrega, "repoName" | "repoDeleted" | "autogradingActualizadoEn" | "autogradingRunId">>
): Entrega {
  const item = new Entrega();
  item.id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  item.repoName = `tp-alumno-${index}`;
  item.repoUrl = `https://github.com/org/tp-alumno-${index}`;
  Object.assign(item, overrides);
  return item;
}

describe("sincronizarAutogradingDeEntregas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActualizarAutograding.mockResolvedValue(undefined);
  });

  it("no consulta entregas sin repo", async () => {
    const sinRepo = new Entrega();
    sinRepo.id = "sin-repo";

    const resultado = await sincronizarAutogradingDeEntregas([sinRepo]);

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
    expect(mockGetUltimaEjecucion).not.toHaveBeenCalled();
  });

  it("no consulta entregas con el repo borrado", async () => {
    const borrada = entregaConRepo(1, { repoDeleted: true });

    const resultado = await sincronizarAutogradingDeEntregas([borrada]);

    expect(resultado.omitidas).toBe(1);
    expect(mockGetUltimaEjecucion).not.toHaveBeenCalled();
  });

  it("persiste sin_autograding cuando el repo no tiene el workflow", async () => {
    const entrega = entregaConRepo(1);
    mockGetUltimaEjecucion.mockResolvedValue({ tipo: "sin_workflow" });

    const resultado = await sincronizarAutogradingDeEntregas([entrega]);

    expect(resultado).toEqual({ actualizadas: 1, omitidas: 0, fallidas: [] });
    expect(mockActualizarAutograding).toHaveBeenCalledWith(entrega.id, {
      resultadoNombre: "sin_autograding",
    });
  });

  it("persiste sin_ejecuciones cuando el workflow nunca corrió", async () => {
    const entrega = entregaConRepo(1);
    mockGetUltimaEjecucion.mockResolvedValue({ tipo: "sin_ejecuciones" });

    await sincronizarAutogradingDeEntregas([entrega]);

    expect(mockActualizarAutograding).toHaveBeenCalledWith(entrega.id, {
      resultadoNombre: "sin_ejecuciones",
    });
  });

  it("consulta con el repoName de la entrega y persiste el resultado mapeado en la entrega correcta", async () => {
    const entrega = entregaConRepo(1);
    mockGetUltimaEjecucion.mockResolvedValue({
      tipo: "ejecucion",
      runId: "42",
      runUrl: "https://github.com/org/tp-alumno-1/actions/runs/42",
      commitSha: "abc123",
      status: "completed",
      conclusion: "success",
      ejecutadoEn: "2026-08-19T10:00:00Z",
    });

    await sincronizarAutogradingDeEntregas([entrega]);

    expect(mockGetUltimaEjecucion).toHaveBeenCalledWith("tp-alumno-1");
    expect(mockActualizarAutograding).toHaveBeenCalledWith(entrega.id, {
      resultadoNombre: "aprobado",
      runId: "42",
      runUrl: "https://github.com/org/tp-alumno-1/actions/runs/42",
      commitSha: "abc123",
      ejecutadoEn: new Date("2026-08-19T10:00:00Z"),
    });
  });

  it("respeta la ventana de frescura y omite una entrega consultada hace poco", async () => {
    const entrega = entregaConRepo(1, { autogradingActualizadoEn: new Date() });

    const resultado = await sincronizarAutogradingDeEntregas([entrega]);

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
    expect(mockGetUltimaEjecucion).not.toHaveBeenCalled();
  });

  it("forzar ignora la ventana de frescura", async () => {
    const entrega = entregaConRepo(1, { autogradingActualizadoEn: new Date() });
    mockGetUltimaEjecucion.mockResolvedValue({ tipo: "sin_ejecuciones" });

    const resultado = await sincronizarAutogradingDeEntregas([entrega], { forzar: true });

    expect(resultado.actualizadas).toBe(1);
    expect(mockGetUltimaEjecucion).toHaveBeenCalled();
  });

  it("un fallo puntual no aborta el lote y no pisa el resultado previo de esa entrega", async () => {
    const falla = entregaConRepo(1);
    const ok = entregaConRepo(2);
    mockGetUltimaEjecucion.mockImplementation(async (repoName: string) => {
      if (repoName === falla.repoName) throw new Error("timeout de GitHub");
      return { tipo: "sin_ejecuciones" };
    });

    const resultado = await sincronizarAutogradingDeEntregas([falla, ok]);

    expect(resultado.actualizadas).toBe(1);
    expect(resultado.fallidas).toEqual([
      { repoName: "tp-alumno-1", error: "timeout de GitHub" },
    ]);
    expect(mockActualizarAutograding).not.toHaveBeenCalledWith(
      falla.id,
      expect.anything()
    );
  });

  it("redacta credenciales en el mensaje de un fallo antes de devolverlo", async () => {
    const entrega = entregaConRepo(1);
    mockGetUltimaEjecucion.mockRejectedValue(
      new Error("GitHub rechazó token=github_pat_secreto123")
    );

    const resultado = await sincronizarAutogradingDeEntregas([entrega]);

    expect(resultado.fallidas[0]?.error).toBe("GitHub rechazó token=[REDACTED]");
  });
});

describe("reejecutarAutogradingDeEntrega", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActualizarAutograding.mockResolvedValue(undefined);
    mockReejecutar.mockResolvedValue(undefined);
  });

  it("pide el rerun en GitHub y deja la entrega en pendiente", async () => {
    const entrega = entregaConRepo(1, { autogradingRunId: "42" });

    await reejecutarAutogradingDeEntrega(entrega);

    expect(mockReejecutar).toHaveBeenCalledWith("tp-alumno-1", "42");
    expect(mockActualizarAutograding).toHaveBeenCalledWith(entrega.id, {
      resultadoNombre: "pendiente",
    });
  });

  it("rechaza si no hay una run previa para reejecutar", async () => {
    const entrega = entregaConRepo(1);

    await expect(reejecutarAutogradingDeEntrega(entrega)).rejects.toThrow();
    expect(mockReejecutar).not.toHaveBeenCalled();
  });
});
