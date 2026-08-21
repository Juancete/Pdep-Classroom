import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAfter = vi.fn();
const mockRegistrar = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (task: () => unknown) => mockAfter(task) };
});
vi.mock("./repositories/ErrorLogRepository", () => ({
  registrarErrorInesperado: (...args: unknown[]) => mockRegistrar(...args),
}));
vi.mock("./logger", () => ({ logger: { error: (...args: unknown[]) => mockLoggerError(...args) } }));

import { internalServerError } from "./api-errors";

describe("internalServerError", () => {
  beforeEach(() => vi.clearAllMocks());

  it("responde 500, loggea y difiere la persistencia sanitizada", async () => {
    const response = internalServerError("POST /api/test", new Error("falló juan@example.com"), { token: "x" });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Error interno del servidor" });
    expect(mockLoggerError).toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledWith(expect.any(Function));
    await mockAfter.mock.calls[0]![0]();
    expect(mockRegistrar).toHaveBeenCalledWith(expect.objectContaining({
      route: "POST /api/test",
      message: "falló [EMAIL_REDACTED]",
      context: { token: "[REDACTED]" },
    }));
  });

  it("no propaga una falla del UPSERT", async () => {
    mockRegistrar.mockRejectedValue(new Error("DB caída"));
    const response = internalServerError("GET /api/test", new Error("falló"));
    await expect(mockAfter.mock.calls[0]![0]()).resolves.toBeUndefined();
    expect(response.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalledTimes(2);
  });

  it("no propaga una falla al programar after", () => {
    mockAfter.mockImplementationOnce(() => { throw new Error("sin request context"); });
    expect(() => internalServerError("GET /api/test", new Error("falló"))).not.toThrow();
    expect(mockLoggerError).toHaveBeenCalledTimes(2);
  });
});
