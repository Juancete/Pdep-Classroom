import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDelete = vi.fn();
const mockCreateUsingTemplate = vi.fn();
const mockAddCollaborator = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    repos = {
      delete: mockDelete,
      createUsingTemplate: mockCreateUsingTemplate,
      addCollaborator: mockAddCollaborator,
    };
  },
}));

vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));

import { crearEntrega, deleteRepo } from "./github";

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
});
