import { beforeEach, describe, expect, it, vi } from "vitest";
import { Entrega } from "@/domain/entities";

const mockGetEstadoCI = vi.fn();
const mockReejecutar = vi.fn();
const mockActualizarCI = vi.fn();

vi.mock("@/lib/github", () => ({
  getEstadoCI: (repoName: string) => mockGetEstadoCI(repoName),
  reejecutarCI: (repoName: string, checkSuiteIds: string[]) =>
    mockReejecutar(repoName, checkSuiteIds),
}));

vi.mock("@/lib/repositories", () => ({
  actualizarCIDeEntrega: (entregaId: string, data: unknown) =>
    mockActualizarCI(entregaId, data),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { sincronizarCIDeEntregas, reejecutarCIDeEntrega } from "./sincronizarCI";

function entregaConRepo(
  index: number,
  overrides?: Partial<Pick<Entrega, "repoName" | "repoDeleted" | "ciActualizadoEn" | "ciCheckSuiteIds">>
): Entrega {
  const item = new Entrega();
  item.id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  item.repoName = `tp-alumno-${index}`;
  item.repoUrl = `https://github.com/org/tp-alumno-${index}`;
  Object.assign(item, overrides);
  return item;
}

describe("sincronizarCIDeEntregas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActualizarCI.mockResolvedValue(undefined);
  });

  it("no consulta entregas sin repo", async () => {
    const sinRepo = new Entrega();
    sinRepo.id = "sin-repo";

    const resultado = await sincronizarCIDeEntregas([sinRepo]);

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
    expect(mockGetEstadoCI).not.toHaveBeenCalled();
  });

  it("no consulta entregas con el repo borrado", async () => {
    const borrada = entregaConRepo(1, { repoDeleted: true });

    const resultado = await sincronizarCIDeEntregas([borrada]);

    expect(resultado.omitidas).toBe(1);
    expect(mockGetEstadoCI).not.toHaveBeenCalled();
  });

  it("persiste sin_ci cuando el repo no tiene checks", async () => {
    const entrega = entregaConRepo(1);
    mockGetEstadoCI.mockResolvedValue({ tipo: "sin_ci" });

    const resultado = await sincronizarCIDeEntregas([entrega]);

    expect(resultado).toEqual({ actualizadas: 1, omitidas: 0, fallidas: [] });
    expect(mockActualizarCI).toHaveBeenCalledWith(entrega.id, {
      resultadoNombre: "sin_ci",
    });
  });

  it("consulta con el repoName de la entrega y persiste el resultado agregado en la entrega correcta", async () => {
    const entrega = entregaConRepo(1);
    mockGetEstadoCI.mockResolvedValue({
      tipo: "checks",
      checkSuiteIds: ["111"],
      commitSha: "abc123",
      detalleUrl: "https://github.com/org/tp-alumno-1/commit/abc123/checks",
      ejecutadoEn: "2026-08-19T10:00:00Z",
      checkRuns: [{ status: "completed", conclusion: "success" }],
    });

    await sincronizarCIDeEntregas([entrega]);

    expect(mockGetEstadoCI).toHaveBeenCalledWith("tp-alumno-1");
    expect(mockActualizarCI).toHaveBeenCalledWith(entrega.id, {
      resultadoNombre: "passing",
      checkSuiteIds: ["111"],
      commitSha: "abc123",
      detalleUrl: "https://github.com/org/tp-alumno-1/commit/abc123/checks",
      ejecutadoEn: new Date("2026-08-19T10:00:00Z"),
    });
  });

  it("respeta la ventana de frescura y omite una entrega consultada hace poco", async () => {
    const entrega = entregaConRepo(1, { ciActualizadoEn: new Date() });

    const resultado = await sincronizarCIDeEntregas([entrega]);

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
    expect(mockGetEstadoCI).not.toHaveBeenCalled();
  });

  it("forzar ignora la ventana de frescura", async () => {
    const entrega = entregaConRepo(1, { ciActualizadoEn: new Date() });
    mockGetEstadoCI.mockResolvedValue({ tipo: "sin_ci" });

    const resultado = await sincronizarCIDeEntregas([entrega], { forzar: true });

    expect(resultado.actualizadas).toBe(1);
    expect(mockGetEstadoCI).toHaveBeenCalled();
  });

  it("un fallo puntual no aborta el lote y no pisa el resultado previo de esa entrega", async () => {
    const falla = entregaConRepo(1);
    const ok = entregaConRepo(2);
    mockGetEstadoCI.mockImplementation(async (repoName) => {
      if (repoName === falla.repoName) throw new Error("timeout de GitHub");
      return { tipo: "sin_ci" };
    });

    const resultado = await sincronizarCIDeEntregas([falla, ok]);

    expect(resultado.actualizadas).toBe(1);
    expect(resultado.fallidas).toEqual([
      { repoName: "tp-alumno-1", error: "timeout de GitHub" },
    ]);
    expect(mockActualizarCI).not.toHaveBeenCalledWith(falla.id, expect.anything());
  });

  it("redacta credenciales en el mensaje de un fallo antes de devolverlo", async () => {
    const entrega = entregaConRepo(1);
    mockGetEstadoCI.mockRejectedValue(
      new Error("GitHub rechazó token=github_pat_secreto123")
    );

    const resultado = await sincronizarCIDeEntregas([entrega]);

    expect(resultado.fallidas[0]?.error).toBe("GitHub rechazó token=[REDACTED]");
  });
});

describe("reejecutarCIDeEntrega", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActualizarCI.mockResolvedValue(undefined);
    mockReejecutar.mockResolvedValue(undefined);
  });

  it("pide el rerequest en GitHub y deja la entrega en pendiente", async () => {
    const entrega = entregaConRepo(1, { ciCheckSuiteIds: ["111", "222"] });

    await reejecutarCIDeEntrega(entrega);

    expect(mockReejecutar).toHaveBeenCalledWith("tp-alumno-1", ["111", "222"]);
    expect(mockActualizarCI).toHaveBeenCalledWith(entrega.id, {
      resultadoNombre: "pendiente",
    });
  });

  it("rechaza si no hay check suites previos para reejecutar", async () => {
    const entrega = entregaConRepo(1);

    await expect(reejecutarCIDeEntrega(entrega)).rejects.toThrow();
    expect(mockReejecutar).not.toHaveBeenCalled();
  });
});
