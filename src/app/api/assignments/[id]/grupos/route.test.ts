import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoEncontradoError,
} from "@/lib/services/assignmentAuthorization";
import {
  AssignmentNoGrupalError,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockCrearGrupo = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getAssignment: (id: string) => mockGetAssignment(id),
  getGruposDeAssignment: (id: string) => mockGetGruposDeAssignment(id),
  crearGrupo: (params: unknown) => mockCrearGrupo(params),
}));

import { GET, POST } from "./route";

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
  return { id, githubUsername: github, comision: { id: "c1" } };
}

function makeAssignment(overrides = {}) {
  return { id: "a1", comision: { id: "c1" }, ...overrides };
}

function makeGrupoEntity(overrides = {}) {
  return {
    id: "g1",
    nombre: "Los Lambdas",
    paradigma: "funcional",
    maxIntegrantes: 3,
    isOpen: () => true,
    alumnos: { getItems: () => [{ githubUsername: "ana" }] },
    usernamesDeMiembros: () => ["ana"],
    ...overrides,
  };
}

function makeRequest(body?: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/assignments/a1/grupos", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("GET /api/assignments/[id]/grupos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetGruposDeAssignment.mockResolvedValue([makeGrupoEntity()]);
  });

  it("devuelve 200 con la lista de grupos serializados", async () => {
    const response = await GET(makeRequest(undefined, "GET"), { params: { id: "a1" } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: "g1",
      nombre: "Los Lambdas",
      maxIntegrantes: 3,
      estaLleno: false,
      miembros: ["ana"],
    });
  });

  it("devuelve lista vacía si no hay grupos", async () => {
    mockGetGruposDeAssignment.mockResolvedValue([]);
    const response = await GET(makeRequest(undefined, "GET"), { params: { id: "a1" } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it("devuelve 403 y no consulta grupos para un alumno de otra comisión", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno("alumno-ana", "ana"));
    mockGetAssignment.mockResolvedValue(makeAssignment({ comision: { id: "c2" } }));

    const response = await GET(makeRequest(undefined, "GET"), { params: { id: "a1" } });

    expect(response.status).toBe(403);
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);

    const response = await GET(makeRequest(undefined, "GET"), { params: { id: "a1" } });

    expect(response.status).toBe(404);
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });

  it("permite acceso global al administrador", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ isAdmin: true }));

    const response = await GET(makeRequest(undefined, "GET"), { params: { id: "a1" } });

    expect(response.status).toBe(200);
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
  });

  it("devuelve 401 si el usuario no está autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await GET(makeRequest(undefined, "GET"), { params: { id: "a1" } });
    expect(response.status).toBe(401);
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });
});

describe("POST /api/assignments/[id]/grupos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockCrearGrupo.mockResolvedValue(makeGrupoEntity());
  });

  it("crea el grupo y devuelve 201 con el grupo serializado", async () => {
    const response = await POST(makeRequest({ nombre: "Los Lambdas" }), { params: { id: "a1" } });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.nombre).toBe("Los Lambdas");
    expect(data.miembros).toContain("ana");
  });

  it("llama a crearGrupo con assignmentId, alumnoId y nombre", async () => {
    await POST(makeRequest({ nombre: "Los Lambdas" }), { params: { id: "a1" } });
    expect(mockCrearGrupo).toHaveBeenCalledWith({
      assignmentId: "a1",
      alumnoId: "alumno-ana",
      nombre: "Los Lambdas",
      esAdmin: false,
    });
  });

  it("propaga el contexto administrativo confiable a la transacción", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ isAdmin: true }));

    await POST(makeRequest({ nombre: "Los Lambdas" }), { params: { id: "a1" } });

    expect(mockCrearGrupo).toHaveBeenCalledWith(
      expect.objectContaining({ esAdmin: true })
    );
  });

  it("devuelve 400 si el body no tiene nombre", async () => {
    const response = await POST(makeRequest({}), { params: { id: "a1" } });
    expect(response.status).toBe(400);
  });

  it("devuelve 403 si el alumno no está registrado", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(403);
    expect(mockCrearGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el assignment no es grupal", async () => {
    mockCrearGrupo.mockRejectedValue(new AssignmentNoGrupalError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(400);
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockCrearGrupo.mockRejectedValue(new AssignmentNoEncontradoError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(404);
  });

  it("devuelve 403 si la autorización transaccional rechaza la comisión", async () => {
    mockCrearGrupo.mockRejectedValue(new AccesoAssignmentProhibidoError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(403);
  });

  it("devuelve 409 si las inscripciones están cerradas", async () => {
    mockCrearGrupo.mockRejectedValue(new InscripcionesCerradasError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el alumno ya está en otro grupo del assignment", async () => {
    mockCrearGrupo.mockRejectedValue(new AlumnoYaEnGrupoDelAssignmentError("a1", "ana"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(409);
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockCrearGrupo.mockRejectedValue(new Error("DB exploded"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(500);
  });
});
