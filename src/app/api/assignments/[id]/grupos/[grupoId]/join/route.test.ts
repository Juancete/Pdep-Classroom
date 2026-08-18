import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  AccesoAssignmentProhibidoError,
  GrupoNoEncontradoError,
} from "@/lib/services/assignmentAuthorization";
import {
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  GrupoLlenoError,
  DOCENTE,
  ESTUDIANTE,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockUnirseAGrupo = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
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
    rol: ESTUDIANTE,
    ...overrides,
  };
}

function makeAlumno(id = "alumno-ana", github = "ana") {
  return { id, githubUsername: github, comision: { id: "c1" } };
}

function makeGrupoEntity(overrides = {}) {
  return {
    id: "g1",
    nombre: "Los Lambdas",
    paradigma: "funcional",
    maxIntegrantes: 3,
    isOpen: () => true,
    alumnos: { getItems: () => [{ githubUsername: "bob" }, { githubUsername: "ana" }] },
    usernamesDeMiembros: () => ["bob", "ana"],
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
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockUnirseAGrupo.mockResolvedValue(makeGrupoEntity());
  });

  it("devuelve 200 con el grupo actualizado", async () => {
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe("g1");
    expect(data.miembros).toContain("ana");
  });

  it("llama a unirseAGrupo con grupoId, alumnoId y el usuario actor", async () => {
    await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(mockUnirseAGrupo).toHaveBeenCalledWith({
      assignmentId: "a1",
      grupoId: "g1",
      alumnoId: "alumno-ana",
      usuario: makeUser(),
    });
  });

  it("propaga el contexto administrativo confiable a la transacción", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE }));

    await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });

    expect(mockUnirseAGrupo).toHaveBeenCalledWith(
      expect.objectContaining({ usuario: expect.objectContaining({ rol: DOCENTE }) })
    );
  });

  it("devuelve 403 si el alumno no está registrado", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(403);
    expect(mockUnirseAGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 409 si las inscripciones están cerradas", async () => {
    mockUnirseAGrupo.mockRejectedValue(new InscripcionesCerradasError("a1"));
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el alumno ya está en otro grupo del assignment", async () => {
    mockUnirseAGrupo.mockRejectedValue(
      new AlumnoYaEnGrupoDelAssignmentError("a1", "ana")
    );
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el grupo está lleno", async () => {
    mockUnirseAGrupo.mockRejectedValue(new GrupoLlenoError("g1", 3));
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(409);
  });

  it("devuelve 404 si el grupo no pertenece al assignment de la URL", async () => {
    mockUnirseAGrupo.mockRejectedValue(new GrupoNoEncontradoError("a1", "g1"));
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(404);
  });

  it("devuelve 403 si la autorización transaccional rechaza la comisión", async () => {
    mockUnirseAGrupo.mockRejectedValue(new AccesoAssignmentProhibidoError("a1"));
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(403);
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockUnirseAGrupo.mockRejectedValue(new Error("DB exploded"));
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1", grupoId: "g1" }) });
    expect(response.status).toBe(500);
  });
});
