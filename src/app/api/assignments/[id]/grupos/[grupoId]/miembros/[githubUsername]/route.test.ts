import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  DOCENTE,
  ESTUDIANTE,
  GrupoNoEncontradoError,
  GrupoLlenoError,
  GrupoConEntregaError,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  AlumnoNoEsMiembroDelGrupoError,
  Grupo,
  Alumno,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockSalirDeGrupo = vi.fn();
const mockMoverAlumnoDeGrupo = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  salirDeGrupo: (params: unknown) => mockSalirDeGrupo(params),
  moverAlumnoDeGrupo: (params: unknown) => mockMoverAlumnoDeGrupo(params),
}));

import { PUT, DELETE } from "./route";

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

function makeGrupoEntity(overrides: Partial<Grupo> = {}): Grupo {
  const grupo = new Grupo();
  grupo.id = "g1";
  grupo.nombre = "Los Lambdas";
  grupo.nombreNormalizado = "los-lambdas";
  grupo.paradigma = "funcional";
  grupo.maxIntegrantes = 3;
  grupo.creadoPor = "ana";
  const miembro = Object.assign(new Alumno(), { githubUsername: "ana" });
  Object.assign(grupo, {
    alumnos: { getItems: () => [miembro], length: 1 },
  });
  return Object.assign(grupo, overrides);
}

function makeRequest(method: "PUT" | "DELETE", body?: unknown): Request {
  return new Request(
    "http://localhost/api/assignments/a1/grupos/g1/miembros/ana",
    {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    }
  );
}

function makeParams(githubUsername = "ana") {
  return { params: Promise.resolve({ id: "a1", grupoId: "g1", githubUsername }) };
}

describe("PUT /api/assignments/[id]/grupos/[grupoId]/miembros/[githubUsername]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockMoverAlumnoDeGrupo.mockResolvedValue({
      grupoDestino: makeGrupoEntity(),
      grupoOrigenEliminado: false,
    });
  });

  it("devuelve 401 sin sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(401);
    expect(mockMoverAlumnoDeGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 403 si el username del path no es el propio y el usuario no es docente", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "otro" }));
    const response = await PUT(makeRequest("PUT"), makeParams("ana"));
    expect(response.status).toBe(403);
    expect(mockMoverAlumnoDeGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 200 con el grupo destino cuando el propio alumno se cambia", async () => {
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe("g1");
    expect(data.grupoOrigenEliminado).toBe(false);
    expect(mockMoverAlumnoDeGrupo).toHaveBeenCalledWith({
      assignmentId: "a1",
      grupoDestinoId: "g1",
      githubUsername: "ana",
      usuario: expect.objectContaining({ githubUsername: "ana" }),
      motivo: undefined,
    });
  });

  it("permite al docente mover a otro alumno", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "docente1", rol: DOCENTE }));
    const response = await PUT(makeRequest("PUT"), makeParams("ana"));
    expect(response.status).toBe(200);
    expect(mockMoverAlumnoDeGrupo).toHaveBeenCalledWith(
      expect.objectContaining({
        githubUsername: "ana",
        usuario: expect.objectContaining({ githubUsername: "docente1", rol: DOCENTE }),
      })
    );
  });

  it("acepta un motivo opcional y lo propaga", async () => {
    const response = await PUT(makeRequest("PUT", { motivo: "cambio de comisión" }), makeParams());
    expect(response.status).toBe(200);
    expect(mockMoverAlumnoDeGrupo).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: "cambio de comisión" })
    );
  });

  it("devuelve 400 si el motivo supera los 280 caracteres", async () => {
    const response = await PUT(makeRequest("PUT", { motivo: "x".repeat(281) }), makeParams());
    expect(response.status).toBe(400);
    expect(mockMoverAlumnoDeGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el grupo destino no pertenece al assignment", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(new GrupoNoEncontradoError("a1", "g1"));
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(404);
  });

  it("devuelve 409 si el grupo destino está completo", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(new GrupoLlenoError("g1", 3));
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si las inscripciones están cerradas", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(new InscripcionesCerradasError("a1"));
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el grupo origen ya entregó y no puede resolverlo un alumno", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(new GrupoConEntregaError("g0"));
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si una carrera concurrente ya lo inscribió en otro grupo", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(
      new AlumnoYaEnGrupoDelAssignmentError("a1", "ana")
    );
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(409);
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(new Error("DB exploded"));
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/assignments/[id]/grupos/[grupoId]/miembros/[githubUsername]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockSalirDeGrupo.mockResolvedValue({
      grupo: makeGrupoEntity(),
      grupoEliminado: false,
    });
  });

  it("devuelve 401 sin sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    expect(response.status).toBe(401);
    expect(mockSalirDeGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 403 con username ajeno sin ser docente", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "otro" }));
    const response = await DELETE(makeRequest("DELETE"), makeParams("ana"));
    expect(response.status).toBe(403);
    expect(mockSalirDeGrupo).not.toHaveBeenCalled();
  });

  it("un alumno puede salir de su propio grupo, pasando rol ESTUDIANTE", async () => {
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    expect(response.status).toBe(200);
    expect(mockSalirDeGrupo).toHaveBeenCalledWith({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      usuario: expect.objectContaining({ githubUsername: "ana", rol: ESTUDIANTE }),
      motivo: undefined,
    });
  });

  it("un docente puede sacar a otro alumno, pasando rol DOCENTE", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "docente1", rol: DOCENTE }));
    const response = await DELETE(makeRequest("DELETE"), makeParams("ana"));
    expect(response.status).toBe(200);
    expect(mockSalirDeGrupo).toHaveBeenCalledWith(
      expect.objectContaining({
        githubUsername: "ana",
        usuario: expect.objectContaining({ githubUsername: "docente1", rol: DOCENTE }),
      })
    );
  });

  it("devuelve grupoEliminado en la respuesta cuando el grupo se borró", async () => {
    mockSalirDeGrupo.mockResolvedValue({ grupo: makeGrupoEntity(), grupoEliminado: true });
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    const data = await response.json();
    expect(data.grupoEliminado).toBe(true);
  });

  it("devuelve 400 si el motivo supera los 280 caracteres", async () => {
    const response = await DELETE(makeRequest("DELETE", { motivo: "x".repeat(281) }), makeParams());
    expect(response.status).toBe(400);
    expect(mockSalirDeGrupo).not.toHaveBeenCalled();
  });

  it("devuelve 409 si el alumno no es miembro del grupo", async () => {
    mockSalirDeGrupo.mockRejectedValue(new AlumnoNoEsMiembroDelGrupoError("g1", "ana"));
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el grupo ya entregó", async () => {
    mockSalirDeGrupo.mockRejectedValue(new GrupoConEntregaError("g1"));
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    expect(response.status).toBe(409);
  });

  it("devuelve 404 si el grupo no pertenece al assignment", async () => {
    mockSalirDeGrupo.mockRejectedValue(new GrupoNoEncontradoError("a1", "g1"));
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    expect(response.status).toBe(404);
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockSalirDeGrupo.mockRejectedValue(new Error("DB exploded"));
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    expect(response.status).toBe(500);
  });
});
