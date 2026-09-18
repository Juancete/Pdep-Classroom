import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoEncontradoError,
  AssignmentNoGrupalError,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
  DOCENTE,
  ESTUDIANTE,
  ParticipanteDocente,
  Grupo,
  Alumno,
} from "@/domain/entities";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockCrearGrupo = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getComisionActiva: () => mockGetComisionActiva(),
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
    rol: ESTUDIANTE,
    ...overrides,
  };
}

function makeAlumno(id = "alumno-ana", github = "ana") {
  const comision = { id: "c1" };
  // `confirmoRegistroEn` duck-typed (issue #107, revisión de code review):
  // `ParticipanteAlumno.comisionDeParticipacion` ahora lo llama para exigir
  // registro confirmado, no alcanza con tener `comision`.
  return {
    id,
    githubUsername: github,
    comision,
    confirmoRegistroEn: (otraComision: { id: string } | null) =>
      otraComision?.id === comision.id,
  };
}

function makeAssignment(overrides = {}) {
  return { id: "a1", comision: { id: "c1" }, ...overrides };
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
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetGruposDeAssignment.mockResolvedValue([makeGrupoEntity()]);
  });

  it("devuelve 200 con la lista de grupos serializados", async () => {
    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });
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
    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  // issue #107/#112: sólo se listan los grupos del tipo que integra este
  // participante — un alumno no ve los grupos de docentes.
  it("filtra los grupos por el tipo que integra el participante", async () => {
    const grupoDeAlumnos = makeGrupoEntity({ id: "g1" });
    const grupoDeDocentes = makeGrupoEntity({ id: "g2" });
    grupoDeDocentes.tipoDeIntegrantes = "docentes";
    mockGetGruposDeAssignment.mockResolvedValue([grupoDeAlumnos, grupoDeDocentes]);

    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("g1");
  });

  it("devuelve 403 y no consulta grupos para un alumno de otra comisión", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno("alumno-ana", "ana"));
    mockGetAssignment.mockResolvedValue(makeAssignment({ comision: { id: "c2" } }));

    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });

    expect(response.status).toBe(403);
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);

    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });

    expect(response.status).toBe(404);
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });

  // issue #107/#112: el docente ya no tiene acceso global — participa desde
  // la comisión activa, igual que un alumno participa desde la suya.
  it("el docente ve los grupos cuando la comisión activa coincide con la del assignment", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE }));

    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });

    expect(response.status).toBe(200);
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
  });

  it("devuelve 403 al docente si la comisión activa no coincide con la del assignment", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    mockGetComisionActiva.mockResolvedValue({ id: "c2" });

    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });

    expect(response.status).toBe(403);
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });

  it("devuelve 401 si el usuario no está autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await GET(makeRequest(undefined, "GET"), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(401);
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
  });
});

describe("POST /api/assignments/[id]/grupos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
    mockCrearGrupo.mockResolvedValue(makeGrupoEntity());
  });

  it("crea el grupo y devuelve 201 con el grupo serializado", async () => {
    const response = await POST(makeRequest({ nombre: "Los Lambdas" }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.nombre).toBe("Los Lambdas");
    expect(data.miembros).toContain("ana");
  });

  it("llama a crearGrupo con assignmentId, nombre y el participante resuelto", async () => {
    await POST(makeRequest({ nombre: "Los Lambdas" }), { params: Promise.resolve({ id: "a1" }) });
    expect(mockCrearGrupo).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "a1",
        nombre: "Los Lambdas",
        participante: expect.objectContaining({ githubUsername: "ana" }),
      })
    );
  });

  // issue #107/#112: el docente participa con un `ParticipanteDocente`
  // (tipo de grupo "docentes"), no con el bypass administrativo del rol.
  it("resuelve un ParticipanteDocente para el rol docente", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE, githubUsername: "profe-docente" }));

    await POST(makeRequest({ nombre: "Profes FP" }), { params: Promise.resolve({ id: "a1" }) });

    expect(mockCrearGrupo).toHaveBeenCalledTimes(1);
    const [{ participante }] = mockCrearGrupo.mock.calls[0];
    expect(participante).toBeInstanceOf(ParticipanteDocente);
    expect(participante.githubUsername).toBe("profe-docente");
    expect(participante.tipoDeGrupo()).toBe("docentes");
  });

  it("devuelve 400 si el body no tiene nombre", async () => {
    const response = await POST(makeRequest({}), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(400);
  });

  it("devuelve 400 si el assignment no es grupal", async () => {
    mockCrearGrupo.mockRejectedValue(new AssignmentNoGrupalError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(400);
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockCrearGrupo.mockRejectedValue(new AssignmentNoEncontradoError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(404);
  });

  it("devuelve 403 si la autorización transaccional rechaza la comisión", async () => {
    mockCrearGrupo.mockRejectedValue(new AccesoAssignmentProhibidoError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(403);
  });

  it("devuelve 409 si las inscripciones están cerradas", async () => {
    mockCrearGrupo.mockRejectedValue(new InscripcionesCerradasError("a1"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si el alumno ya está en otro grupo del assignment", async () => {
    mockCrearGrupo.mockRejectedValue(new AlumnoYaEnGrupoDelAssignmentError("a1", "ana"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(409);
  });

  it("devuelve 409 si ya existe un grupo con el mismo nombre", async () => {
    mockCrearGrupo.mockRejectedValue(
      new NombreGrupoDuplicadoError("a1", "Los Lambdas")
    );
    const response = await POST(makeRequest({ nombre: "Los Lambdas" }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        'Ya existe un grupo con el mismo nombre o identificador normalizado que "Los Lambdas" para este TP.',
    });
  });

  it("devuelve 400 si el nombre no genera un identificador válido", async () => {
    mockCrearGrupo.mockRejectedValue(new NombreGrupoInvalidoError("+++"));

    const response = await POST(makeRequest({ nombre: "+++" }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "El nombre del grupo debe incluir al menos una letra o un número.",
    });
  });

  it("devuelve 400 si el nombre completo del repositorio supera el límite", async () => {
    mockCrearGrupo.mockRejectedValue(
      new NombreRepositorioDemasiadoLargoError("a".repeat(101))
    );

    const response = await POST(makeRequest({ nombre: "Los Lambdas" }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "El nombre del repositorio generado supera el límite de 100 caracteres de GitHub.",
    });
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockCrearGrupo.mockRejectedValue(new Error("DB exploded"));
    const response = await POST(makeRequest({ nombre: "x" }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(500);
  });
});
