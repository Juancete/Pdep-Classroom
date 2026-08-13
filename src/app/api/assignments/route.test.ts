import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdepUser } from "@/types";

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetAssignments = vi.fn();
const mockGetAssignmentsDeComision = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getAssignments: () => mockGetAssignments(),
  getAssignmentsDeComision: (comisionId: string) =>
    mockGetAssignmentsDeComision(comisionId),
}));

import { GET } from "./route";

function makeUser(overrides: Partial<PdepUser> = {}): PdepUser {
  return {
    githubUsername: "ana",
    name: "Ana",
    image: "",
    isAdmin: false,
    ...overrides,
  };
}

describe("GET /api/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockGetAlumnoByGithub.mockResolvedValue({
      id: "alumno-ana",
      comision: { id: "c1" },
    });
    mockGetAssignmentsDeComision.mockResolvedValue([{ id: "a1" }]);
    mockGetAssignments.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  });

  it("devuelve 401 sin sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetAssignments).not.toHaveBeenCalled();
    expect(mockGetAssignmentsDeComision).not.toHaveBeenCalled();
  });

  it("lista únicamente los assignments de la comisión del alumno", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetAssignmentsDeComision).toHaveBeenCalledWith("c1");
    expect(mockGetAssignments).not.toHaveBeenCalled();
  });

  it("devuelve 403 si el usuario no está registrado como alumno", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mockGetAssignmentsDeComision).not.toHaveBeenCalled();
  });

  it("mantiene el listado global para administradores", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ isAdmin: true }));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mockGetAssignments).toHaveBeenCalled();
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
    expect(mockGetAssignmentsDeComision).not.toHaveBeenCalled();
  });
});
