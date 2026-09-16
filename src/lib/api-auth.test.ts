import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities";

const mockGetCurrentUser = vi.fn();
const mockRequireUser = vi.fn();

// Clase real (no un mock) para que `instanceof` funcione tanto en el
// código bajo test como en los asserts de este archivo.
const { FakePermisosNoVerificablesError } = vi.hoisted(() => {
  class FakePermisosNoVerificablesError extends Error {
    constructor(cause: unknown) {
      super("No se pudieron verificar tus permisos. Reintentá en unos segundos.");
      this.name = "PermisosNoVerificablesError";
      this.cause = cause;
    }
  }
  return { FakePermisosNoVerificablesError };
});

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  requireUser: () => mockRequireUser(),
  PermisosNoVerificablesError: FakePermisosNoVerificablesError,
}));

import { guardAdmin, guardUser } from "./api-auth";

describe("guardAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve 401 cuando no hay sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await guardAdmin();
    expect(response?.status).toBe(401);
  });

  it("devuelve 403 cuando hay sesión sin rol docente", async () => {
    mockGetCurrentUser.mockResolvedValue({ rol: ESTUDIANTE });
    const response = await guardAdmin();
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: "Acceso prohibido" });
  });

  it("permite el acceso docente", async () => {
    mockGetCurrentUser.mockResolvedValue({ rol: DOCENTE });
    await expect(guardAdmin()).resolves.toBeNull();
  });

  it("no disfraza una falla inesperada de autenticación como 401", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("auth caída"));
    await expect(guardAdmin()).rejects.toThrow("auth caída");
  });

  it("devuelve 503 si no se pudo verificar el rol (fail hard, no reutiliza permisos previos)", async () => {
    mockGetCurrentUser.mockRejectedValue(new FakePermisosNoVerificablesError(new Error("DB caída")));
    const response = await guardAdmin();
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "No se pudieron verificar tus permisos. Reintentá en unos segundos.",
    });
  });
});

describe("guardUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve null si requireUser resuelve", async () => {
    mockRequireUser.mockResolvedValue({ githubUsername: "ana" });
    await expect(guardUser()).resolves.toBeNull();
  });

  it("devuelve 401 si requireUser lanza (ej. redirect)", async () => {
    mockRequireUser.mockRejectedValue(new Error("redirect:/login"));
    const response = await guardUser();
    expect(response?.status).toBe(401);
  });

  it("devuelve 503 si no se pudo verificar el rol", async () => {
    mockRequireUser.mockRejectedValue(new FakePermisosNoVerificablesError(new Error("DB caída")));
    const response = await guardUser();
    expect(response?.status).toBe(503);
  });
});
