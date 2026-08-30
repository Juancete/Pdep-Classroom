import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDelete = vi.fn();
const mockCreateUsingTemplate = vi.fn();
const mockAddCollaborator = vi.fn();
const mockReposGet = vi.fn();
const mockListForOrg = vi.fn();
const mockPaginate = vi.fn();
const mockListForRef = vi.fn();
const mockRerequestSuite = vi.fn();
const mockCheckCollaborator = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    repos = {
      delete: mockDelete,
      createUsingTemplate: mockCreateUsingTemplate,
      addCollaborator: mockAddCollaborator,
      get: mockReposGet,
      listForOrg: mockListForOrg,
      checkCollaborator: mockCheckCollaborator,
    };
    checks = {
      listForRef: mockListForRef,
      rerequestSuite: mockRerequestSuite,
    };
    paginate = mockPaginate;
  },
}));

vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));

import {
  crearEntrega,
  deleteRepo,
  getEstadoCI,
  reejecutarCI,
  esColaborador,
  getRepoInfo,
  getRepoInfoPorId,
} from "./github";
import { NombreRepositorioDemasiadoLargoError } from "./naming";

function requestError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe("deleteRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve deleted cuando GitHub elimina el repositorio", async () => {
    mockDelete.mockResolvedValue(undefined);

    await expect(deleteRepo("tp-ana")).resolves.toBe("deleted");
    expect(mockDelete).toHaveBeenCalledWith({
      owner: expect.any(String),
      repo: "tp-ana",
    });
  });

  it("trata un 404 como éxito idempotente", async () => {
    mockDelete.mockRejectedValue(requestError(404, "Not Found"));

    await expect(deleteRepo("tp-ausente")).resolves.toBe("already_absent");
  });

  it("propaga errores distintos de 404", async () => {
    mockDelete.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(deleteRepo("tp-prohibido")).rejects.toThrow(
      "permisos suficientes"
    );
  });
});

describe("crearEntrega", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa sin recalcular el nombre de repositorio recibido, y devuelve el id numérico de GitHub", async () => {
    mockCreateUsingTemplate.mockResolvedValue({
      data: {
        html_url: "https://github.com/pdep-mn-utn/tp-los-lambdas",
        full_name: "pdep-mn-utn/tp-los-lambdas",
        id: 987654,
      },
    });
    mockAddCollaborator.mockResolvedValue(undefined);

    await expect(
      crearEntrega({
        templateRepo: "template",
        repoName: "tp-los-lambdas",
        usernames: ["ana", "bob"],
      })
    ).resolves.toEqual({
      repoName: "tp-los-lambdas",
      repoUrl: "https://github.com/pdep-mn-utn/tp-los-lambdas",
      repoGithubId: "987654",
    });

    expect(mockCreateUsingTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tp-los-lambdas" })
    );
    expect(mockAddCollaborator).toHaveBeenCalledTimes(2);
  });

  // Fase 3 de la auditoría de dominio: `crearEntrega` ya no resuelve el
  // nombre del template él mismo (antes usaba `extractTemplateName`,
  // duplicado de `Assignment.nombreDelTemplate()`) — recibe el nombre ya
  // resuelto del caller y lo pasa tal cual a `createRepoFromTemplate`.
  it("pasa el templateRepo recibido tal cual, sin volver a resolverlo", async () => {
    mockCreateUsingTemplate.mockResolvedValue({
      data: {
        html_url: "https://github.com/pdep-mn-utn/tp-los-lambdas",
        full_name: "pdep-mn-utn/tp-los-lambdas",
        id: 987654,
      },
    });
    mockAddCollaborator.mockResolvedValue(undefined);

    await crearEntrega({
      templateRepo: "kata-template",
      repoName: "tp-los-lambdas",
      usernames: ["ana"],
    });

    expect(mockCreateUsingTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ template_repo: "kata-template" })
    );
  });

  it("rechaza un nombre demasiado largo antes de invocar GitHub", async () => {
    await expect(
      crearEntrega({
        templateRepo: "template",
        repoName: "a".repeat(101),
        usernames: ["ana"],
      })
    ).rejects.toBeInstanceOf(NombreRepositorioDemasiadoLargoError);

    expect(mockCreateUsingTemplate).not.toHaveBeenCalled();
    expect(mockAddCollaborator).not.toHaveBeenCalled();
  });
});

describe("getEstadoCI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReposGet.mockResolvedValue({ data: { default_branch: "main" } });
  });

  it("consulta los checks del branch por defecto y arma el detalle", async () => {
    mockListForRef.mockResolvedValue({
      data: {
        total_count: 2,
        check_runs: [
          {
            status: "completed",
            conclusion: "success",
            head_sha: "abc123",
            completed_at: "2026-08-19T10:05:00Z",
            started_at: "2026-08-19T10:00:00Z",
            check_suite: { id: 111 },
          },
          {
            status: "completed",
            conclusion: "success",
            head_sha: "abc123",
            completed_at: "2026-08-19T10:03:00Z",
            started_at: "2026-08-19T10:00:00Z",
            check_suite: { id: 111 },
          },
        ],
      },
    });

    await expect(getEstadoCI("tp-ana")).resolves.toEqual({
      tipo: "checks",
      checkSuiteIds: ["111"],
      commitSha: "abc123",
      detalleUrl: expect.stringContaining("/tp-ana/commit/abc123/checks"),
      ejecutadoEn: "2026-08-19T10:05:00Z",
      checkRuns: [
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
      ],
    });
    expect(mockReposGet).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "tp-ana" })
    );
    expect(mockListForRef).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "tp-ana", ref: "main" })
    );
  });

  it("junta ids de check suite únicos cuando hay varios workflows", async () => {
    mockListForRef.mockResolvedValue({
      data: {
        total_count: 2,
        check_runs: [
          {
            status: "completed",
            conclusion: "success",
            head_sha: "abc123",
            completed_at: "2026-08-19T10:00:00Z",
            started_at: null,
            check_suite: { id: 111 },
          },
          {
            status: "completed",
            conclusion: "success",
            head_sha: "abc123",
            completed_at: "2026-08-19T10:00:00Z",
            started_at: null,
            check_suite: { id: 222 },
          },
        ],
      },
    });

    const resultado = await getEstadoCI("tp-multi");
    expect(resultado.tipo).toBe("checks");
    if (resultado.tipo === "checks") {
      expect(resultado.checkSuiteIds.sort()).toEqual(["111", "222"]);
    }
  });

  it("devuelve sin_ci cuando no hay ningún check run", async () => {
    mockListForRef.mockResolvedValue({
      data: { total_count: 0, check_runs: [] },
    });

    await expect(getEstadoCI("tp-sin-ci")).resolves.toEqual({ tipo: "sin_ci" });
  });

  it("propaga errores traducidos de repos.get (403)", async () => {
    mockReposGet.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getEstadoCI("tp-prohibido")).rejects.toThrow("permisos suficientes");
    expect(mockListForRef).not.toHaveBeenCalled();
  });

  it("propaga errores traducidos de checks.listForRef", async () => {
    mockListForRef.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getEstadoCI("tp-prohibido")).rejects.toThrow("permisos suficientes");
  });
});

describe("reejecutarCI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide el rerequest de cada check suite convertido a número", async () => {
    mockRerequestSuite.mockResolvedValue(undefined);

    await reejecutarCI("tp-ana", ["111", "222"]);

    expect(mockRerequestSuite).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "tp-ana", check_suite_id: 111 })
    );
    expect(mockRerequestSuite).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "tp-ana", check_suite_id: 222 })
    );
    expect(mockRerequestSuite).toHaveBeenCalledTimes(2);
  });

  it("propaga errores traducidos", async () => {
    mockRerequestSuite.mockRejectedValue(requestError(404, "Not Found"));

    await expect(reejecutarCI("tp-ana", ["1"])).rejects.toThrow();
  });
});

describe("esColaborador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve true cuando GitHub responde 204 (es colaborador)", async () => {
    mockCheckCollaborator.mockResolvedValue(undefined);

    await expect(esColaborador("tp-ana", "juancito")).resolves.toBe(true);
    expect(mockCheckCollaborator).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "tp-ana", username: "juancito" })
    );
  });

  it("devuelve false cuando GitHub responde 404 (no es colaborador)", async () => {
    mockCheckCollaborator.mockRejectedValue(requestError(404, "Not Found"));

    await expect(esColaborador("tp-ana", "juancito")).resolves.toBe(false);
  });

  it("propaga (traducido) cualquier otro error que no sea 404", async () => {
    mockCheckCollaborator.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(esColaborador("tp-ana", "juancito")).rejects.toThrow();
  });
});

describe("getRepoInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el id numérico y la URL cuando el repo existe", async () => {
    mockReposGet.mockResolvedValue({
      data: {
        id: 555666,
        html_url: "https://github.com/pdep-mn-utn/tp-ana",
        description: "TP — PdeP",
        created_at: "2026-08-23T12:00:00Z",
      },
    });

    await expect(getRepoInfo("tp-ana")).resolves.toEqual({
      repoGithubId: "555666",
      repoUrl: "https://github.com/pdep-mn-utn/tp-ana",
      description: "TP — PdeP",
      createdAt: new Date("2026-08-23T12:00:00Z"),
    });
  });

  it("devuelve null cuando el repo no existe (404)", async () => {
    mockReposGet.mockRejectedValue(requestError(404, "Not Found"));

    await expect(getRepoInfo("tp-ausente")).resolves.toBeNull();
  });

  it("propaga (traducido) cualquier error distinto de 404", async () => {
    mockReposGet.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getRepoInfo("tp-prohibido")).rejects.toThrow();
  });
});

describe("getRepoInfoPorId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("busca el id en el listado paginado y devuelve nombre y URL actuales", async () => {
    mockPaginate.mockResolvedValue([
      { id: 111, name: "otro", html_url: "https://github.com/pdep-mn-utn/otro" },
      { id: 555666, name: "tp-ana-nuevo", html_url: "https://github.com/pdep-mn-utn/tp-ana-nuevo" },
    ]);

    await expect(getRepoInfoPorId("555666")).resolves.toEqual({
      repoName: "tp-ana-nuevo",
      repoUrl: "https://github.com/pdep-mn-utn/tp-ana-nuevo",
    });
    expect(mockPaginate).toHaveBeenCalledWith(
      mockListForOrg,
      expect.objectContaining({ type: "all", per_page: 100 })
    );
  });

  it("devuelve null cuando el id no pertenece a ningún repo de la organización", async () => {
    mockPaginate.mockResolvedValue([]);

    await expect(getRepoInfoPorId("555666")).resolves.toBeNull();
  });

  it("devuelve null cuando GitHub responde 404", async () => {
    mockPaginate.mockRejectedValue(requestError(404, "Not Found"));

    await expect(getRepoInfoPorId("555666")).resolves.toBeNull();
  });

  it("propaga (traducido) cualquier otro error que no sea 404", async () => {
    mockPaginate.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getRepoInfoPorId("555666")).rejects.toThrow();
  });
});
