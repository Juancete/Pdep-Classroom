import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockCambiarEstadoAssignment = vi.fn();

const {
  FakeAssignmentNoEncontradoError,
  FakeTransicionDeEstadoInvalidaError,
} = vi.hoisted(() => ({
  FakeAssignmentNoEncontradoError: class AssignmentNoEncontradoError extends Error {},
  FakeTransicionDeEstadoInvalidaError: class TransicionDeEstadoInvalidaError extends Error {},
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  cambiarEstadoAssignment: (id: string, estado: string, porUsuario: string) =>
    mockCambiarEstadoAssignment(id, estado, porUsuario),
}));

vi.mock("@/lib/services/assignmentAuthorization", () => ({
  AssignmentNoEncontradoError: FakeAssignmentNoEncontradoError,
}));

vi.mock("@/domain/entities", () => ({
  TransicionDeEstadoInvalidaError: FakeTransicionDeEstadoInvalidaError,
}));

import { PATCH } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides = {}) {
  return {
    id: "a1",
    estadoNombre: "publicado",
    estado: { etiqueta: () => "Publicado" },
    publicadoEn: new Date("2026-08-14T00:00:00.000Z"),
    publicadoPor: "docente1",
    archivadoEn: undefined,
    archivadoPor: undefined,
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/assignments/a1/estado", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/assignments/[id]/estado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "docente1",
      isAdmin: true,
    });
    mockCambiarEstadoAssignment.mockResolvedValue(makeAssignment());
  });

  it("devuelve 401 si no hay sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await PATCH(makeRequest({ estado: "publicado" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(401);
    expect(mockCambiarEstadoAssignment).not.toHaveBeenCalled();
  });

  it("devuelve 401 si el usuario no es admin", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "ana",
      isAdmin: false,
    });
    const response = await PATCH(makeRequest({ estado: "publicado" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(401);
    expect(mockCambiarEstadoAssignment).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body tiene un estado desconocido", async () => {
    const response = await PATCH(makeRequest({ estado: "vigente" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(400);
    expect(mockCambiarEstadoAssignment).not.toHaveBeenCalled();
  });

  it("publica y devuelve 200 con la auditoría", async () => {
    const response = await PATCH(makeRequest({ estado: "publicado" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.estado).toBe("publicado");
    expect(data.etiqueta).toBe("Publicado");
    expect(data.publicadoPor).toBe("docente1");
    expect(mockCambiarEstadoAssignment).toHaveBeenCalledWith(
      "a1",
      "publicado",
      "docente1"
    );
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockCambiarEstadoAssignment.mockRejectedValue(
      new FakeAssignmentNoEncontradoError("Assignment no encontrado")
    );
    const response = await PATCH(makeRequest({ estado: "publicado" }), {
      params: Promise.resolve({ id: "no-existe" }),
    });
    expect(response.status).toBe(404);
  });

  it("devuelve 409 con el motivo si la transición no está permitida", async () => {
    mockCambiarEstadoAssignment.mockRejectedValue(
      new FakeTransicionDeEstadoInvalidaError(
        'No se puede pasar de "publicado" a "borrador": tiene entregas — archivalo en vez de despublicarlo'
      )
    );
    const response = await PATCH(makeRequest({ estado: "borrador" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("archivalo");
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockCambiarEstadoAssignment.mockRejectedValue(new Error("DB explotó"));
    const response = await PATCH(makeRequest({ estado: "publicado" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(500);
  });
});
