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
  GrupoNoAdmiteParticipanteError,
  AccesoAssignmentProhibidoError,
  Grupo,
  Alumno,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockSalirDeGrupo = vi.fn();
const mockMoverAlumnoDeGrupo = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getComisionActiva: () => mockGetComisionActiva(),
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
    miembros: { getItems: () => [miembro], length: 1 },
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
    mockGetAlumnoByGithub.mockResolvedValue({
      id: "alumno-ana",
      githubUsername: "ana",
      comision: { id: "c1" },
    });
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
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
      actor: expect.objectContaining({ githubUsername: "ana" }),
      realizadoPor: "ana",
      motivo: undefined,
    });
  });

  // issue #107/#112: el docente administra con el bypass de
  // `RolDeUsuario.actorSobreMembresiaAjena()` — ya no es un `Participante`.
  it("el docente administra la membresía de otro con el bypass administrativo", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "docente1", rol: DOCENTE }));

    const response = await PUT(makeRequest("PUT"), makeParams("ana"));

    expect(response.status).toBe(200);
    expect(mockMoverAlumnoDeGrupo).toHaveBeenCalledTimes(1);
    const [{ githubUsername, actor, realizadoPor }] = mockMoverAlumnoDeGrupo.mock.calls[0];
    expect(githubUsername).toBe("ana");
    expect(realizadoPor).toBe("docente1");
    expect(actor.origenDeAuditoria()).toBe("docente");
    expect(() => actor.autorizarCambioDeMembresia({} as never)).not.toThrow();
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

  it("devuelve 409 si el grupo origen ya aceptó el TP y no puede resolverlo un alumno", async () => {
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

  // Revisión de code review (issue #107/#112): `moverAlumnoDeGrupo` ahora
  // valida acceso al assignment y el tipo de grupo antes de dar de alta —
  // la ruta sólo necesita traducir esos dos errores de dominio nuevos.
  it("un docente que intenta sumarse a un grupo de alumnos recibe 409", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(new GrupoNoAdmiteParticipanteError("g1"));
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(409);
  });

  it("un usuario sin registro que intenta sumarse recibe 403", async () => {
    mockMoverAlumnoDeGrupo.mockRejectedValue(new AccesoAssignmentProhibidoError("a1"));
    const response = await PUT(makeRequest("PUT"), makeParams());
    expect(response.status).toBe(403);
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
    mockGetAlumnoByGithub.mockResolvedValue({
      id: "alumno-ana",
      githubUsername: "ana",
      comision: { id: "c1" },
    });
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
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

  it("un alumno puede salir de su propio grupo con el Participante resuelto", async () => {
    const response = await DELETE(makeRequest("DELETE"), makeParams());
    expect(response.status).toBe(200);
    expect(mockSalirDeGrupo).toHaveBeenCalledWith({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: expect.objectContaining({ githubUsername: "ana" }),
      realizadoPor: "ana",
      motivo: undefined,
    });
  });

  it("el docente saca a otro alumno con el bypass administrativo", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "docente1", rol: DOCENTE }));
    const response = await DELETE(makeRequest("DELETE"), makeParams("ana"));
    expect(response.status).toBe(200);
    expect(mockSalirDeGrupo).toHaveBeenCalledTimes(1);
    const [{ githubUsername, actor, realizadoPor }] = mockSalirDeGrupo.mock.calls[0];
    expect(githubUsername).toBe("ana");
    expect(realizadoPor).toBe("docente1");
    expect(actor.origenDeAuditoria()).toBe("docente");
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

  it("devuelve 409 si el grupo ya aceptó el TP", async () => {
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
