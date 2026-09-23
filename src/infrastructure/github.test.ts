import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const mockDelete = vi.fn();
const mockCreateUsingTemplate = vi.fn();
const mockAddCollaborator = vi.fn();
const mockRemoveCollaborator = vi.fn();
const mockReposGet = vi.fn();
const mockListForOrg = vi.fn();
const mockPaginate = vi.fn();
const mockListForRef = vi.fn();
const mockRerequestSuite = vi.fn();
const mockCheckCollaborator = vi.fn();
const mockListContributors = vi.fn();
const mockSearchRepos = vi.fn();
const mockAuth = vi.fn();
const mockRequest = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    repos = {
      delete: mockDelete,
      createUsingTemplate: mockCreateUsingTemplate,
      addCollaborator: mockAddCollaborator,
      removeCollaborator: mockRemoveCollaborator,
      get: mockReposGet,
      listForOrg: mockListForOrg,
      checkCollaborator: mockCheckCollaborator,
      listContributors: mockListContributors,
    };
    checks = {
      listForRef: mockListForRef,
      rerequestSuite: mockRerequestSuite,
    };
    search = {
      repos: mockSearchRepos,
    };
    paginate = mockPaginate;
    auth = mockAuth;
    request = mockRequest;
  },
}));

vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));

import {
  addCollaborators,
  crearEntrega,
  deleteRepo,
  removeCollaborator,
  REINTENTOS_TRAS_CREAR_REPO,
  SIN_REINTENTOS,
  getConfiguracionDeApp,
  getEstadoCI,
  reejecutarCI,
  esColaborador,
  getContribuciones,
  getRepoInfo,
  getRepoInfoPorId,
  listarTemplates,
} from "./github";
import type { ClienteAcotadoDeGithub } from "./github";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";

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

describe("addCollaborators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reintenta ante un 404 transitorio con la política de creación de repo", async () => {
    mockAddCollaborator
      .mockRejectedValueOnce(requestError(404, "Not Found"))
      .mockResolvedValueOnce(undefined);

    const promesa = addCollaborators("tp-ana", ["ana"], "push", REINTENTOS_TRAS_CREAR_REPO);
    await vi.runAllTimersAsync();

    await expect(promesa).resolves.toBeUndefined();
    expect(mockAddCollaborator).toHaveBeenCalledTimes(2);
  });

  it("no reintenta cuando el caller pide la política sin reintentos", async () => {
    mockAddCollaborator.mockRejectedValue(requestError(404, "Not Found"));

    const promesa = addCollaborators("tp-ana", ["ana"], "push", SIN_REINTENTOS);
    const resultado = expect(promesa).rejects.toThrow();
    await vi.runAllTimersAsync();

    await resultado;
    expect(mockAddCollaborator).toHaveBeenCalledTimes(1);
  });

  it("pasa un AbortSignal a la invitación cuando la política define timeout", async () => {
    mockAddCollaborator.mockResolvedValue(undefined);

    await addCollaborators("tp-ana", ["ana"], "push", SIN_REINTENTOS);

    const [argumentos] = mockAddCollaborator.mock.calls[0];
    expect(argumentos.request.signal).toBeInstanceOf(AbortSignal);
  });

  it("no pasa un AbortSignal con la política por defecto", async () => {
    mockAddCollaborator.mockResolvedValue(undefined);

    await addCollaborators("tp-ana", ["ana"]);

    const [argumentos] = mockAddCollaborator.mock.calls[0];
    expect(argumentos.request).toBeUndefined();
  });
});

describe("removeCollaborator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revoca el acceso del colaborador y lo reporta", async () => {
    mockRemoveCollaborator.mockResolvedValue(undefined);

    await expect(removeCollaborator("tp-ana", "ana")).resolves.toBe("revocado");
    expect(mockRemoveCollaborator).toHaveBeenCalledWith({
      owner: expect.any(String),
      repo: "tp-ana",
      username: "ana",
      request: { signal: expect.any(AbortSignal) },
    });
  });

  it("pasa un AbortSignal a la revocación", async () => {
    mockRemoveCollaborator.mockResolvedValue(undefined);

    await removeCollaborator("tp-ana", "ana");

    const [argumentos] = mockRemoveCollaborator.mock.calls[0];
    expect(argumentos.request.signal).toBeInstanceOf(AbortSignal);
  });

  it("trata el 404 como que el alumno ya no tenía acceso", async () => {
    mockRemoveCollaborator.mockRejectedValue(requestError(404, "Not Found"));

    await expect(removeCollaborator("tp-ana", "ana")).resolves.toBe("ya_no_tenia_acceso");
  });

  it("traduce el 403 al mensaje operativo de permisos de la App", async () => {
    mockRemoveCollaborator.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(removeCollaborator("tp-ana", "ana")).rejects.toThrow("permisos suficientes");
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
    mockPaginate.mockResolvedValue([
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
    ]);

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
    expect(mockPaginate).toHaveBeenCalledWith(
      mockListForRef,
      expect.objectContaining({ repo: "tp-ana", ref: "main" })
    );
  });

  it("junta ids de check suite únicos cuando hay varios workflows", async () => {
    mockPaginate.mockResolvedValue([
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
    ]);

    const resultado = await getEstadoCI("tp-multi");
    expect(resultado.tipo).toBe("checks");
    if (resultado.tipo === "checks") {
      expect(resultado.checkSuiteIds.sort()).toEqual(["111", "222"]);
    }
  });

  it("devuelve sin_ci cuando no hay ningún check run", async () => {
    mockPaginate.mockResolvedValue([]);

    await expect(getEstadoCI("tp-sin-ci")).resolves.toEqual({ tipo: "sin_ci" });
  });

  it("propaga errores traducidos de repos.get (403)", async () => {
    mockReposGet.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getEstadoCI("tp-prohibido")).rejects.toThrow("permisos suficientes");
    expect(mockPaginate).not.toHaveBeenCalled();
  });

  it("propaga errores traducidos de checks.listForRef", async () => {
    mockPaginate.mockRejectedValue(requestError(403, "Forbidden"));

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

describe("getContribuciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pagina contribuidores y mapea login/contributions a login/commits", async () => {
    mockPaginate.mockResolvedValue([
      { login: "ana-garcia", contributions: 10 },
      { login: "juancito", contributions: 3 },
    ]);

    await expect(getContribuciones("tp-ana")).resolves.toEqual([
      { login: "ana-garcia", commits: 10 },
      { login: "juancito", commits: 3 },
    ]);
    expect(mockPaginate).toHaveBeenCalledWith(
      mockListContributors,
      expect.objectContaining({ repo: "tp-ana", per_page: 100, anon: "1" })
    );
  });

  it("devuelve [] para un repo sin commits (204 ya normalizado por paginate)", async () => {
    mockPaginate.mockResolvedValue([]);

    await expect(getContribuciones("tp-sin-commits")).resolves.toEqual([]);
  });

  it("una fila anónima (type: Anonymous) se mapea sin login y se conserva junto a las de login", async () => {
    mockPaginate.mockResolvedValue([
      { login: "ana-garcia", contributions: 10 },
      { type: "Anonymous", contributions: 3, email: "x@y", name: "X" },
    ]);

    await expect(getContribuciones("tp-con-anon")).resolves.toEqual([
      { login: "ana-garcia", commits: 10 },
      { commits: 3 },
    ]);
  });

  it("una fila sin login y sin type: Anonymous hace fallar la consulta con un error de validación", async () => {
    mockPaginate.mockResolvedValue([{ type: "User", contributions: 3 }]);

    await expect(getContribuciones("tp-con-anon")).rejects.toThrow();
  });

  it("propaga errores traducidos de paginate (403)", async () => {
    mockPaginate.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getContribuciones("tp-prohibido")).rejects.toThrow("permisos suficientes");
  });

  it("usa cliente.octokit cuando viene, en vez del cliente global", async () => {
    const paginateDelCliente = vi.fn().mockResolvedValue([{ login: "ana", contributions: 1 }]);
    const listContributorsDelCliente = vi.fn();
    const cliente = {
      octokit: {
        repos: { listContributors: listContributorsDelCliente },
        paginate: paginateDelCliente,
      },
    } as unknown as ClienteAcotadoDeGithub;

    await expect(getContribuciones("tp-ana", cliente)).resolves.toEqual([
      { login: "ana", commits: 1 },
    ]);
    expect(paginateDelCliente).toHaveBeenCalledWith(
      listContributorsDelCliente,
      expect.objectContaining({ repo: "tp-ana" })
    );
    expect(mockPaginate).not.toHaveBeenCalled();
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

  it("pasa un AbortSignal a la consulta del repo cuando se pide timeout", async () => {
    mockReposGet.mockResolvedValue({
      data: { id: 1, html_url: "https://github.com/o/tp-ana", description: null, created_at: null },
    });

    await getRepoInfo("tp-ana", { timeoutMs: 5000 });

    const [argumentos] = mockReposGet.mock.calls[0];
    expect(argumentos.request.signal).toBeInstanceOf(AbortSignal);
  });

  it("no pasa un AbortSignal a la consulta del repo por defecto", async () => {
    mockReposGet.mockResolvedValue({
      data: { id: 1, html_url: "https://github.com/o/tp-ana", description: null, created_at: null },
    });

    await getRepoInfo("tp-ana");

    const [argumentos] = mockReposGet.mock.calls[0];
    expect(argumentos.request).toBeUndefined();
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

  it("resuelve el repo por id con una sola llamada y devuelve nombre y URL actuales", async () => {
    mockRequest.mockResolvedValue({
      data: {
        id: 555666,
        name: "tp-ana-nuevo",
        html_url: "https://github.com/pdep-mn-utn/tp-ana-nuevo",
        owner: { login: "pdep-mn-utn" },
      },
    });

    await expect(getRepoInfoPorId("555666")).resolves.toEqual({
      repoName: "tp-ana-nuevo",
      repoUrl: "https://github.com/pdep-mn-utn/tp-ana-nuevo",
    });
    expect(mockRequest).toHaveBeenCalledWith(
      "GET /repositories/{repository_id}",
      expect.objectContaining({ repository_id: 555666 })
    );
    // Sin listar la org ni filtrar acá (issue #88).
    expect(mockPaginate).not.toHaveBeenCalled();
    expect(mockListForOrg).not.toHaveBeenCalled();
  });

  it("acepta el repo aunque el login de la org difiera en mayúsculas", async () => {
    mockRequest.mockResolvedValue({
      data: {
        id: 555666,
        name: "tp-ana",
        html_url: "https://github.com/PdeP-MN-UTN/tp-ana",
        owner: { login: "PdeP-MN-UTN" },
      },
    });

    await expect(getRepoInfoPorId("555666")).resolves.toEqual({
      repoName: "tp-ana",
      repoUrl: "https://github.com/PdeP-MN-UTN/tp-ana",
    });
  });

  it("devuelve null cuando el id pertenece a un repo de otra organización", async () => {
    mockRequest.mockResolvedValue({
      data: {
        id: 555666,
        name: "ajeno",
        html_url: "https://github.com/otra-org/ajeno",
        owner: { login: "otra-org" },
      },
    });

    await expect(getRepoInfoPorId("555666")).resolves.toBeNull();
  });

  it("devuelve null cuando GitHub responde 404", async () => {
    mockRequest.mockRejectedValue(requestError(404, "Not Found"));

    await expect(getRepoInfoPorId("555666")).resolves.toBeNull();
  });

  it("propaga (traducido) cualquier otro error que no sea 404", async () => {
    mockRequest.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getRepoInfoPorId("555666")).rejects.toThrow();
  });
});

describe("listarTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delega el filtrado de templates a la búsqueda de GitHub, sin incluir forks", async () => {
    mockPaginate.mockResolvedValue([
      { name: "template-logico", full_name: "pdep-mn-utn/template-logico", description: null },
      { name: "template-objetos", full_name: "pdep-mn-utn/template-objetos", description: "TP objetos" },
    ]);

    await expect(listarTemplates()).resolves.toEqual([
      { name: "template-logico", fullName: "pdep-mn-utn/template-logico", description: "" },
      { name: "template-objetos", fullName: "pdep-mn-utn/template-objetos", description: "TP objetos" },
    ]);
    expect(mockPaginate).toHaveBeenCalledWith(
      mockSearchRepos,
      expect.objectContaining({
        q: expect.stringMatching(/^org:\S+ template:true$/),
        per_page: 100,
      })
    );
    expect(mockListForOrg).not.toHaveBeenCalled();
  });

  it("propaga (traducido) los errores de GitHub", async () => {
    mockPaginate.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(listarTemplates()).rejects.toThrow();
  });
});

describe("getConfiguracionDeApp", () => {
  const ENV_BACKUP = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = "cGVtLWZha2U=";
    process.env.GITHUB_APP_INSTALLATION_ID = "456";
    mockAuth.mockResolvedValue({ token: "tok3n" });
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("devuelve permisos, eventos y webhook de la instalación cuando está todo configurado y aprobado", async () => {
    mockRequest.mockImplementation((route: string) => {
      if (route === "GET /app") {
        return Promise.resolve({
          data: {
            permissions: { administration: "write", contents: "write" },
            events: ["check_suite", "push"],
          },
        });
      }
      if (route === "GET /app/installations/{installation_id}") {
        return Promise.resolve({
          data: {
            permissions: { administration: "write", contents: "write" },
            events: ["check_suite", "push"],
          },
        });
      }
      if (route === "GET /app/hook/config") {
        return Promise.resolve({ data: { url: "https://classroom/api/webhooks/github" } });
      }
      throw new Error(`ruta inesperada: ${route}`);
    });

    await expect(getConfiguracionDeApp()).resolves.toEqual({
      permisos: { administration: "write", contents: "write" },
      eventos: ["check_suite", "push"],
      webhook: { url: "https://classroom/api/webhooks/github" },
      aprobacionPendiente: false,
    });
    expect(mockAuth).toHaveBeenCalledWith({ type: "app" });
    expect(mockRequest).toHaveBeenCalledWith(
      "GET /app",
      expect.objectContaining({ headers: { authorization: "bearer tok3n" } })
    );
    expect(mockRequest).toHaveBeenCalledWith(
      "GET /app/installations/{installation_id}",
      expect.objectContaining({
        installation_id: 456,
        headers: { authorization: "bearer tok3n" },
      })
    );
  });

  it("marca aprobacionPendiente cuando la App tiene permisos/eventos que la instalación todavía no aprobó", async () => {
    mockRequest.mockImplementation((route: string) => {
      if (route === "GET /app") {
        return Promise.resolve({
          data: {
            permissions: { administration: "write", contents: "write", checks: "write" },
            events: ["check_suite", "push"],
          },
        });
      }
      if (route === "GET /app/installations/{installation_id}") {
        return Promise.resolve({
          data: {
            permissions: { administration: "write", contents: "write" },
            events: ["push"],
          },
        });
      }
      if (route === "GET /app/hook/config") {
        return Promise.resolve({ data: { url: "https://classroom/api/webhooks/github" } });
      }
      throw new Error(`ruta inesperada: ${route}`);
    });

    await expect(getConfiguracionDeApp()).resolves.toEqual({
      permisos: { administration: "write", contents: "write" },
      eventos: ["push"],
      webhook: { url: "https://classroom/api/webhooks/github" },
      aprobacionPendiente: true,
    });
  });

  it("devuelve webhook null cuando GET /app/hook/config responde 404 (sin webhook configurado)", async () => {
    mockRequest.mockImplementation((route: string) => {
      if (route === "GET /app") {
        return Promise.resolve({
          data: { permissions: { administration: "write" }, events: [] },
        });
      }
      if (route === "GET /app/installations/{installation_id}") {
        return Promise.resolve({
          data: { permissions: { administration: "write" }, events: [] },
        });
      }
      if (route === "GET /app/hook/config") {
        return Promise.reject(requestError(404, "Not Found"));
      }
      throw new Error(`ruta inesperada: ${route}`);
    });

    await expect(getConfiguracionDeApp()).resolves.toEqual({
      permisos: { administration: "write" },
      eventos: [],
      webhook: null,
      aprobacionPendiente: false,
    });
  });

  it("propaga (traducido) un 403 de GET /app", async () => {
    mockRequest.mockImplementation((route: string) => {
      if (route === "GET /app") return Promise.reject(requestError(403, "Forbidden"));
      throw new Error(`ruta inesperada: ${route}`);
    });

    await expect(getConfiguracionDeApp()).rejects.toThrow("permisos suficientes");
  });

  it("rechaza sin llamar a GitHub si falta configuración de GitHub App (fallback a PAT)", async () => {
    delete process.env.GITHUB_APP_ID;

    await expect(getConfiguracionDeApp()).rejects.toThrow(
      "requiere autenticación como GitHub App"
    );
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

// Guard sobre las listas de GitHub (issue #88): toda llamada paginable va
// dentro de `octokit.paginate(...)` (agregados internos, listas chicas) o
// pagina explícitamente con `page:` hacia una vista, con el modelo de la app;
// y lo que se filtra, lo filtra GitHub — nunca `.filter`/`.find` sobre la
// colección paginada. Lee el fuente porque es la única forma barata de
// atrapar una llamada nueva que no tenga test propio.
describe("listas de GitHub", () => {
  const lineas = readFileSync(join(process.cwd(), "src", "infrastructure", "github.ts"), "utf8")
    .split("\n");

  function contexto(indice: number, desde: number, hasta: number): string {
    return lineas.slice(Math.max(0, indice + desde), indice + hasta + 1).join("\n");
  }

  it("cada per_page va dentro de octokit.paginate o pagina explícitamente con page:", () => {
    lineas.forEach((linea, indice) => {
      if (!/\bper_page:/.test(linea)) return;
      const bloque = contexto(indice, -6, 0);
      const paginaTodo = /\.paginate\(/.test(bloque);
      const paginaHaciaVista = /\bpage:/.test(contexto(indice, -6, 3));
      expect(
        paginaTodo || paginaHaciaVista,
        `github.ts:${indice + 1} usa per_page sin octokit.paginate ni page:`
      ).toBe(true);
    });
  });

  it("no filtra en memoria el resultado de octokit.paginate", () => {
    lineas.forEach((linea, indice) => {
      if (!/\.paginate\(/.test(linea)) return;
      const bloqueSiguiente = contexto(indice, 1, 8);
      expect(
        /\.(filter|find)\(\s*\(/.test(bloqueSiguiente),
        `github.ts:${indice + 1}: el resultado de paginate se filtra acá; delegá el filtro a GitHub`
      ).toBe(false);
    });
  });
});
