import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDelete = vi.fn();
const mockCreateUsingTemplate = vi.fn();
const mockAddCollaborator = vi.fn();
const mockListWorkflowRuns = vi.fn();
const mockReRunWorkflow = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    repos = {
      delete: mockDelete,
      createUsingTemplate: mockCreateUsingTemplate,
      addCollaborator: mockAddCollaborator,
    };
    actions = {
      listWorkflowRuns: mockListWorkflowRuns,
      reRunWorkflow: mockReRunWorkflow,
    };
  },
}));

vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));

import {
  crearEntrega,
  deleteRepo,
  getUltimaEjecucionAutograding,
  reejecutarAutograding,
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

  it("usa sin recalcular el nombre de repositorio recibido", async () => {
    mockCreateUsingTemplate.mockResolvedValue({
      data: {
        html_url: "https://github.com/pdep-mn-utn/tp-los-lambdas",
        full_name: "pdep-mn-utn/tp-los-lambdas",
      },
    });
    mockAddCollaborator.mockResolvedValue(undefined);

    await expect(
      crearEntrega({
        templateRepo: "pdep-mn-utn/template",
        repoName: "tp-los-lambdas",
        usernames: ["ana", "bob"],
      })
    ).resolves.toEqual({
      repoName: "tp-los-lambdas",
      repoUrl: "https://github.com/pdep-mn-utn/tp-los-lambdas",
    });

    expect(mockCreateUsingTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tp-los-lambdas" })
    );
    expect(mockAddCollaborator).toHaveBeenCalledTimes(2);
  });

  it("rechaza un nombre demasiado largo antes de invocar GitHub", async () => {
    await expect(
      crearEntrega({
        templateRepo: "pdep-mn-utn/template",
        repoName: "a".repeat(101),
        usernames: ["ana"],
      })
    ).rejects.toBeInstanceOf(NombreRepositorioDemasiadoLargoError);

    expect(mockCreateUsingTemplate).not.toHaveBeenCalled();
    expect(mockAddCollaborator).not.toHaveBeenCalled();
  });
});

describe("getUltimaEjecucionAutograding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve la última ejecución cuando hay al menos una run", async () => {
    mockListWorkflowRuns.mockResolvedValue({
      data: {
        total_count: 3,
        workflow_runs: [
          {
            id: 987654321,
            html_url: "https://github.com/org/tp-ana/actions/runs/987654321",
            head_sha: "abc123",
            status: "completed",
            conclusion: "success",
            updated_at: "2026-08-19T10:00:00Z",
          },
        ],
      },
    });

    await expect(getUltimaEjecucionAutograding("tp-ana")).resolves.toEqual({
      tipo: "ejecucion",
      runId: "987654321",
      runUrl: "https://github.com/org/tp-ana/actions/runs/987654321",
      commitSha: "abc123",
      status: "completed",
      conclusion: "success",
      ejecutadoEn: "2026-08-19T10:00:00Z",
    });
    expect(mockListWorkflowRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: "tp-ana",
        workflow_id: "autograding.yml",
        per_page: 1,
      })
    );
  });

  it("devuelve sin_ejecuciones cuando el workflow existe pero total_count es 0", async () => {
    mockListWorkflowRuns.mockResolvedValue({
      data: { total_count: 0, workflow_runs: [] },
    });

    await expect(getUltimaEjecucionAutograding("tp-nueva")).resolves.toEqual({
      tipo: "sin_ejecuciones",
    });
  });

  it("devuelve sin_workflow ante un 404 (el repo no tiene autograding.yml)", async () => {
    mockListWorkflowRuns.mockRejectedValue(requestError(404, "Not Found"));

    await expect(getUltimaEjecucionAutograding("tp-sin-workflow")).resolves.toEqual({
      tipo: "sin_workflow",
    });
  });

  it("propaga otros errores traducidos (403)", async () => {
    mockListWorkflowRuns.mockRejectedValue(requestError(403, "Forbidden"));

    await expect(getUltimaEjecucionAutograding("tp-prohibido")).rejects.toThrow(
      "permisos suficientes"
    );
  });
});

describe("reejecutarAutograding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide el rerun con el run_id convertido a número", async () => {
    mockReRunWorkflow.mockResolvedValue(undefined);

    await reejecutarAutograding("tp-ana", "987654321");

    expect(mockReRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ repo: "tp-ana", run_id: 987654321 })
    );
  });

  it("propaga errores traducidos", async () => {
    mockReRunWorkflow.mockRejectedValue(requestError(404, "Not Found"));

    await expect(reejecutarAutograding("tp-ana", "1")).rejects.toThrow();
  });
});
