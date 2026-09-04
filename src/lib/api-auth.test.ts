import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities";

const mockGetCurrentUser = vi.fn();
const mockRequireUser = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  requireUser: () => mockRequireUser(),
}));

import { guardAdmin } from "./api-auth";

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
});
