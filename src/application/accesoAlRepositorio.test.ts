import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Entrega, ColaboradorNoInvitableError } from "@/domain/entities";

const mockGetEntregaLogica = vi.fn();
const mockActualizarColaboradores = vi.fn();
const mockAddCollaborators = vi.fn();
const mockRemoveCollaborator = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  getEntregaLogica: (data: unknown, transaction: unknown) =>
    mockGetEntregaLogica(data, transaction),
  actualizarColaboradoresDeEntrega: (id: string, data: unknown, transaction: unknown) =>
    mockActualizarColaboradores(id, data, transaction),
}));

vi.mock("@/infrastructure/github", () => ({
  SIN_REINTENTOS: { intentos: 1, esperaInicialMs: 0, esperaMaximaMs: 0, timeoutMs: 5000 },
  addCollaborators: (repoName: string, usernames: string[], permission: string, politica: unknown) =>
    mockAddCollaborators(repoName, usernames, permission, politica),
  removeCollaborator: (repoName: string, username: string) =>
    mockRemoveCollaborator(repoName, username),
}));

import { GithubRecursoNoEncontradoError } from "@/infrastructure/github-errors";
import { SIN_REINTENTOS } from "@/infrastructure/github";
import { accesoAlRepositorioDeGrupo } from "./accesoAlRepositorio";

const transaction = { id: "transaccion" } as unknown as EntityManager;
const contexto = { assignmentId: "a1", grupoId: "g1", githubUsername: "juangarcia" };

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const entrega = new Entrega();
  entrega.id = "e1";
  entrega.repoName = "kata-funcional-los-lambdas";
  entrega.repoUrl = "https://github.com/pdep-mn-utn/kata-funcional-los-lambdas";
  entrega.githubUsernames = ["mariaperez"];
  entrega.provisionEstado = "activa";
  entrega.repoDeleted = false;
  entrega.createdAt = new Date();
  return Object.assign(entrega, overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEntregaLogica.mockResolvedValue(makeEntrega());
  mockActualizarColaboradores.mockResolvedValue(undefined);
  mockAddCollaborators.mockResolvedValue(undefined);
  mockRemoveCollaborator.mockResolvedValue("revocado");
});

describe("otorgarA", () => {
  it("invita al alumno al repo y lo suma a los colaboradores de la entrega", async () => {
    await accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction);

    expect(mockAddCollaborators).toHaveBeenCalledWith(
      "kata-funcional-los-lambdas",
      ["juangarcia"],
      "push",
      SIN_REINTENTOS
    );
    expect(mockActualizarColaboradores).toHaveBeenCalledWith(
      "e1",
      { agregar: "juangarcia" },
      transaction
    );
  });

  it("no toca GitHub si el grupo no tiene entrega", async () => {
    mockGetEntregaLogica.mockResolvedValue(null);

    await accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction);

    expect(mockAddCollaborators).not.toHaveBeenCalled();
    expect(mockActualizarColaboradores).not.toHaveBeenCalled();
  });

  it("no toca GitHub si la entrega está pendiente", async () => {
    mockGetEntregaLogica.mockResolvedValue(
      makeEntrega({ provisionEstado: "pendiente", repoUrl: undefined })
    );

    await accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction);

    expect(mockAddCollaborators).not.toHaveBeenCalled();
  });

  it("no toca GitHub si la entrega quedó fallida", async () => {
    mockGetEntregaLogica.mockResolvedValue(
      makeEntrega({ provisionEstado: "fallida", repoUrl: undefined })
    );

    await accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction);

    expect(mockAddCollaborators).not.toHaveBeenCalled();
  });

  it("no toca GitHub si el repo fue borrado", async () => {
    mockGetEntregaLogica.mockResolvedValue(makeEntrega({ repoDeleted: true }));

    await accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction);

    expect(mockAddCollaborators).not.toHaveBeenCalled();
  });

  it("no invita al que ya figura como colaborador de la entrega", async () => {
    mockGetEntregaLogica.mockResolvedValue(
      makeEntrega({ githubUsernames: ["mariaperez", "juangarcia"] })
    );

    await accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction);

    expect(mockAddCollaborators).not.toHaveBeenCalled();
    expect(mockActualizarColaboradores).not.toHaveBeenCalled();
  });

  it("propaga el error de GitHub sin escribir los colaboradores", async () => {
    const errorDeGithub = new Error("GitHub caído");
    mockAddCollaborators.mockRejectedValue(errorDeGithub);

    await expect(accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction)).rejects.toBe(
      errorDeGithub
    );

    expect(mockActualizarColaboradores).not.toHaveBeenCalled();
  });

  it("traduce el 404 de GitHub a un error que el alumno puede entender", async () => {
    mockAddCollaborators.mockRejectedValue(new GithubRecursoNoEncontradoError("404"));

    await expect(
      accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction)
    ).rejects.toBeInstanceOf(ColaboradorNoInvitableError);

    expect(mockActualizarColaboradores).not.toHaveBeenCalled();
  });

  it("usa el EntityManager de la transacción para leer la entrega y escribir los colaboradores", async () => {
    await accesoAlRepositorioDeGrupo.otorgarA(contexto, transaction);

    expect(mockGetEntregaLogica).toHaveBeenCalledWith(
      { assignmentId: "a1", grupoId: "g1" },
      transaction
    );
    expect(mockActualizarColaboradores.mock.calls[0][2]).toBe(transaction);
  });

  it("suma al docente de un grupo de demo a los colaboradores de la entrega", async () => {
    await accesoAlRepositorioDeGrupo.otorgarA(
      { ...contexto, githubUsername: "profe-docente" },
      transaction
    );

    expect(mockAddCollaborators).toHaveBeenCalledWith(
      "kata-funcional-los-lambdas",
      ["profe-docente"],
      "push",
      SIN_REINTENTOS
    );
    expect(mockActualizarColaboradores).toHaveBeenCalledWith(
      "e1",
      { agregar: "profe-docente" },
      transaction
    );
  });
});

describe("revocarA", () => {
  it("revoca el acceso y quita el username de los colaboradores", async () => {
    mockGetEntregaLogica.mockResolvedValue(
      makeEntrega({ githubUsernames: ["mariaperez", "juangarcia"] })
    );

    await accesoAlRepositorioDeGrupo.revocarA(contexto, transaction);

    expect(mockRemoveCollaborator).toHaveBeenCalledWith("kata-funcional-los-lambdas", "juangarcia");
    expect(mockActualizarColaboradores).toHaveBeenCalledWith(
      "e1",
      { quitar: "juangarcia" },
      transaction
    );
  });

  it("revoca igual aunque la entrega no lo tenga registrado como colaborador", async () => {
    await accesoAlRepositorioDeGrupo.revocarA(contexto, transaction);

    expect(mockRemoveCollaborator).toHaveBeenCalledWith("kata-funcional-los-lambdas", "juangarcia");
  });

  it("no toca GitHub si el grupo no tiene entrega", async () => {
    mockGetEntregaLogica.mockResolvedValue(null);

    await accesoAlRepositorioDeGrupo.revocarA(contexto, transaction);

    expect(mockRemoveCollaborator).not.toHaveBeenCalled();
    expect(mockActualizarColaboradores).not.toHaveBeenCalled();
  });

  it("no toca GitHub si la entrega está pendiente", async () => {
    mockGetEntregaLogica.mockResolvedValue(
      makeEntrega({ provisionEstado: "pendiente", repoUrl: undefined })
    );

    await accesoAlRepositorioDeGrupo.revocarA(contexto, transaction);

    expect(mockRemoveCollaborator).not.toHaveBeenCalled();
  });

  it("acepta como éxito que GitHub diga que ya no era colaborador", async () => {
    mockRemoveCollaborator.mockResolvedValue("ya_no_tenia_acceso");

    await accesoAlRepositorioDeGrupo.revocarA(contexto, transaction);

    expect(mockActualizarColaboradores).toHaveBeenCalledWith(
      "e1",
      { quitar: "juangarcia" },
      transaction
    );
  });

  it("propaga el error de GitHub sin escribir los colaboradores", async () => {
    const errorDeGithub = new Error("GitHub caído");
    mockRemoveCollaborator.mockRejectedValue(errorDeGithub);

    await expect(accesoAlRepositorioDeGrupo.revocarA(contexto, transaction)).rejects.toBe(
      errorDeGithub
    );

    expect(mockActualizarColaboradores).not.toHaveBeenCalled();
  });
});
