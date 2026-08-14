import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDelete = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    repos = { delete: mockDelete };
  },
}));

vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));

import { deleteRepo } from "./github";

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
