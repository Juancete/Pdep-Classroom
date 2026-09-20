import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActorDeMembresia, Grupo, Participante } from "@/domain/entities";

const mockUnirseAGrupoEnRepositorio = vi.fn();
const mockSalirDeGrupoEnRepositorio = vi.fn();
const mockMoverAlumnoDeGrupoEnRepositorio = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  unirseAGrupo: (params: unknown) => mockUnirseAGrupoEnRepositorio(params),
  salirDeGrupo: (params: unknown) => mockSalirDeGrupoEnRepositorio(params),
  moverAlumnoDeGrupo: (params: unknown) => mockMoverAlumnoDeGrupoEnRepositorio(params),
}));

vi.mock("./accesoAlRepositorio", () => ({
  accesoAlRepositorioDeGrupo: { otorgarA: vi.fn(), revocarA: vi.fn() },
}));

import { accesoAlRepositorioDeGrupo } from "./accesoAlRepositorio";
import { unirseAGrupo, salirDeGrupo, moverAlumnoDeGrupo } from "./membresiaDeGrupo";

const participante = { githubUsername: "ana" } as unknown as Participante;

describe("unirseAGrupo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delega en el repositorio inyectando el acceso al repositorio de GitHub", async () => {
    mockUnirseAGrupoEnRepositorio.mockResolvedValue({ id: "g1" });

    await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", participante });

    expect(mockUnirseAGrupoEnRepositorio).toHaveBeenCalledWith({
      assignmentId: "a1",
      grupoId: "g1",
      participante,
      acceso: accesoAlRepositorioDeGrupo,
    });
  });

  it("devuelve el grupo que resuelve el repositorio", async () => {
    const grupo = { id: "g1" } as unknown as Grupo;
    mockUnirseAGrupoEnRepositorio.mockResolvedValue(grupo);

    await expect(
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", participante })
    ).resolves.toBe(grupo);
  });
});

describe("salirDeGrupo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delega en el repositorio inyectando el acceso al repositorio de GitHub", async () => {
    const resultado = { grupo: { id: "g1" }, grupoEliminado: false };
    mockSalirDeGrupoEnRepositorio.mockResolvedValue(resultado);
    const params = {
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: participante as unknown as ActorDeMembresia,
      realizadoPor: "ana",
    };

    await expect(salirDeGrupo(params)).resolves.toBe(resultado);

    expect(mockSalirDeGrupoEnRepositorio).toHaveBeenCalledWith({
      ...params,
      acceso: accesoAlRepositorioDeGrupo,
    });
  });
});

describe("moverAlumnoDeGrupo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delega en el repositorio inyectando el acceso al repositorio de GitHub", async () => {
    const resultado = { grupoDestino: { id: "g2" }, grupoOrigenEliminado: false };
    mockMoverAlumnoDeGrupoEnRepositorio.mockResolvedValue(resultado);
    const params = {
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      actor: participante as unknown as ActorDeMembresia,
      realizadoPor: "ana",
    };

    await expect(moverAlumnoDeGrupo(params)).resolves.toBe(resultado);

    expect(mockMoverAlumnoDeGrupoEnRepositorio).toHaveBeenCalledWith({
      ...params,
      acceso: accesoAlRepositorioDeGrupo,
    });
  });
});
