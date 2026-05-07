import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  GrupoLlenoError,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockUnirseAGrupo = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  unirseAGrupo: (params: unknown) => mockUnirseAGrupo(params),
}));

import { POST } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeUser(overrides?: Partial<PdepUser>): PdepUser {
  return {
    githubUsername: "ana",
    name: "Ana García",
    image: "",
    isAdmin: false,
    ...overrides,
  };
}

function makeAlumno(id = "alumno-ana", github = "ana") {
  return { id, githubUsername: github };
}

function makeGrupoEntity(overrides = {}) {
  return {
    id: "g1",
    nombre: "Los Lambdas",
    paradigma: "funcional",
    maxIntegrantes: 3,
    isOpen: () => true,
    alumnos: { getItems: () => [{ githubUsername: "bob" }, { githubUsername: "ana" }] },
    ...overrides,
  };
}

function makeRequest(): Request {
  return new Request(
    "http://localhost/api/assignments/a1/grupos/g1/join",
    { method: "POST" }
  );
}

// ── Tests ────────────────────────────────────────────────────

describe("POST /api/assignments/[id]/grupos/[grupoId]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUser());
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockUnirseAGrupo.mockResolvedValue(makeGrupoEntity());
  });

  it("devuelve 200 con el grupo actualizado", async () => {
    const response = await POST(makeRequest(), { params: { id: "a1", grupoId: "g1" } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe("g1");
    expect(data.miembros).toContain("ana");
  });

  it("llama a unirseAGrupo con grupoId y alumnoId", async () => {
    await POST(makeRequest(), { params: { id: "a1", grupoId: "g1" } });
    expect(mockUnirseAGrupo).toHaveBeenCalledWith({
      grupoId: "g1",
      alumnoId: "alumno-ana",
    });
  });

  it("devuelve 404 si el alumno no está registrado", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);
    const response = await POST(makeRequest(), { params: { id: "a1", grupoId: "g1" } });
    expect(response.status).toBe(404);
    expect(mockUnirseAGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 409 si las inscripciones están cerradas", async () => {
    mockUnirseAGrupo.mockRejectedValue(new InscripcionesCerradasError("a1"));
    const response = await POST(makeRequest(), { params: { id: "a1", grupoId: "g1" } });
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el alumno ya está en otro grupo del assignment", async () => {
    mockUnirseAGrupo.mockRejectedValue(
      new AlumnoYaEnGrupoDelAssignmentError("a1", "ana")
    );
    const response = await POST(makeRequest(), { params: { id: "a1", grupoId: "g1" } });
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el grupo está lleno", async () => {
    mockUnirseAGrupo.mockRejectedValue(new GrupoLlenoError("g1", 3));
    const response = await POST(makeRequest(), { params: { id: "a1", grupoId: "g1" } });
    expect(response.status).toBe(409);
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockUnirseAGrupo.mockRejectedValue(new Error("DB exploded"));
    const response = await POST(makeRequest(), { params: { id: "a1", grupoId: "g1" } });
    expect(response.status).toBe(500);
  });
});
