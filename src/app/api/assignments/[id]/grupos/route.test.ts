import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  AssignmentNoGrupalError,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockCrearGrupo = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
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
  return { id, githubUsername: github };
}

function makeGrupoEntity(overrides = {}) {
  return {
    id: "g1",
    nombre: "Los Lambdas",
    paradigma: "funcional",
    maxIntegrantes: 3,
    isOpen: () => true,
    alumnos: { getItems: () => [{ githubUsername: "ana" }] },
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
    mockRequireUser.mockResolvedValue(makeUser());
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

  it("devuelve 500 si el usuario no está autenticado", async () => {
    mockRequireUser.mockRejectedValue(new Error("redirect"));
    const response = await GET(makeRequest(undefined, "GET"), { params: { id: "a1" } });
    expect(response.status).toBe(500);
  });
});

describe("POST /api/assignments/[id]/grupos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUser());
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
    });
  });

  it("devuelve 400 si el body no tiene nombre", async () => {
    const response = await POST(makeRequest({}), { params: { id: "a1" } });
    expect(response.status).toBe(400);
  });

  it("devuelve 404 si el alumno no está registrado", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(404);
    expect(mockCrearGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el assignment no es grupal", async () => {
    mockCrearGrupo.mockRejectedValue(new AssignmentNoGrupalError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: { id: "a1" } });
    expect(response.status).toBe(400);
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
