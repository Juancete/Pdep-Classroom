import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { Entrega } from "@/domain/entities";

const mockGetContribuciones = vi.fn();
const mockActualizarContribuciones = vi.fn();

vi.mock("@/infrastructure/github", () => ({
  getContribuciones: (repoName: string, github?: unknown) =>
    github === undefined
      ? mockGetContribuciones(repoName)
      : mockGetContribuciones(repoName, github),
}));

vi.mock("@/infrastructure/repositories", () => ({
  actualizarContribucionesDeEntrega: (entregaId: string, contribuciones: unknown, em?: unknown) =>
    em === undefined
      ? mockActualizarContribuciones(entregaId, contribuciones)
      : mockActualizarContribuciones(entregaId, contribuciones, em),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { sincronizarParticipacionDeEntregas } from "./sincronizarParticipacion";

function entregaConRepo(
  index: number,
  overrides?: Partial<
    Pick<Entrega, "repoName" | "repoDeleted" | "contribucionesActualizadoEn">
  >
): Entrega {
  const item = new Entrega();
  item.id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  item.repoName = `tp-alumno-${index}`;
  item.repoUrl = `https://github.com/org/tp-alumno-${index}`;
  Object.assign(item, overrides);
  return item;
}

describe("sincronizarParticipacionDeEntregas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActualizarContribuciones.mockResolvedValue(undefined);
  });

  it("no consulta entregas sin repo", async () => {
    const sinRepo = new Entrega();
    sinRepo.id = "sin-repo";

    const resultado = await sincronizarParticipacionDeEntregas([sinRepo]);

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
    expect(mockGetContribuciones).not.toHaveBeenCalled();
  });

  it("persiste las contribuciones en la entrega correcta", async () => {
    const entrega = entregaConRepo(1);
    const contribuciones = [{ login: "ana", commits: 5 }];
    mockGetContribuciones.mockResolvedValue(contribuciones);

    const resultado = await sincronizarParticipacionDeEntregas([entrega]);

    expect(resultado).toEqual({ actualizadas: 1, omitidas: 0, fallidas: [] });
    expect(mockGetContribuciones).toHaveBeenCalledWith("tp-alumno-1");
    expect(mockActualizarContribuciones).toHaveBeenCalledWith(entrega.id, contribuciones);
  });

  it("respeta la ventana de frescura y omite una entrega ya sincronizada hace poco", async () => {
    const entrega = entregaConRepo(1, { contribucionesActualizadoEn: new Date() });

    const resultado = await sincronizarParticipacionDeEntregas([entrega]);

    expect(resultado).toEqual({ actualizadas: 0, omitidas: 1, fallidas: [] });
    expect(mockGetContribuciones).not.toHaveBeenCalled();
  });

  it("forzar ignora la ventana de frescura", async () => {
    const entrega = entregaConRepo(1, { contribucionesActualizadoEn: new Date() });
    mockGetContribuciones.mockResolvedValue([]);

    const resultado = await sincronizarParticipacionDeEntregas([entrega], { forzar: true });

    expect(resultado.actualizadas).toBe(1);
    expect(mockGetContribuciones).toHaveBeenCalled();
  });

  it("usa el EntityManager recibido para persistir dentro del lock transaccional", async () => {
    const entrega = entregaConRepo(1);
    const transaction = { nombre: "transaction-em" };
    mockGetContribuciones.mockResolvedValue([]);

    await sincronizarParticipacionDeEntregas([entrega], {
      forzar: true,
      em: transaction as never,
    });

    expect(mockActualizarContribuciones).toHaveBeenCalledWith(entrega.id, [], transaction);
  });

  it("pasa el cliente de GitHub acotado a getContribuciones", async () => {
    const entrega = entregaConRepo(1);
    const github = { octokit: {} } as never;
    mockGetContribuciones.mockResolvedValue([]);

    await sincronizarParticipacionDeEntregas([entrega], { forzar: true, github });

    expect(mockGetContribuciones).toHaveBeenCalledWith("tp-alumno-1", github);
  });

  it("un fallo no llama a actualizarContribucionesDeEntrega, queda en fallidas y no aborta el resto", async () => {
    const falla = entregaConRepo(1);
    const ok = entregaConRepo(2);
    mockGetContribuciones.mockImplementation(async (repoName: string) => {
      if (repoName === falla.repoName) throw new Error("timeout de GitHub");
      return [];
    });

    const resultado = await sincronizarParticipacionDeEntregas([falla, ok]);

    expect(resultado.actualizadas).toBe(1);
    expect(resultado.fallidas).toEqual([
      { repoName: "tp-alumno-1", error: "timeout de GitHub" },
    ]);
    expect(mockActualizarContribuciones).not.toHaveBeenCalledWith(falla.id, expect.anything());
  });

  it("redacta credenciales en el mensaje de un fallo antes de devolverlo", async () => {
    const entrega = entregaConRepo(1);
    mockGetContribuciones.mockRejectedValue(
      new Error("GitHub rechazó token=github_pat_secreto123")
    );

    const resultado = await sincronizarParticipacionDeEntregas([entrega]);

    expect(resultado.fallidas[0]?.error).toBe("GitHub rechazó token=[REDACTED]");
  });
});
