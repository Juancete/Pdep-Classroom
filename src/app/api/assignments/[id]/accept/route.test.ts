import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import { Entrega, GrupoNoAsignadoError } from "@/domain/entities";

const {
  mockRequireUser,
  mockCheckRateLimit,
  mockAceptarAssignment,
  FakeAlumnoNoRegistradoError,
  FakeAssignmentNoEncontradoError,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockAceptarAssignment: vi.fn(),
  FakeAlumnoNoRegistradoError: class AlumnoNoRegistradoError extends Error {},
  FakeAssignmentNoEncontradoError: class AssignmentNoEncontradoError extends Error {},
}));

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string) => mockCheckRateLimit(key),
}));

vi.mock("@/lib/services/aceptarAssignment", () => {
  return {
    aceptarAssignment: (assignmentId: string, user: PdepUser) =>
      mockAceptarAssignment(assignmentId, user),
    AlumnoNoRegistradoError: FakeAlumnoNoRegistradoError,
    AssignmentNoEncontradoError: FakeAssignmentNoEncontradoError,
  };
});

import { POST } from "./route";

function makeUser(overrides?: Partial<PdepUser>): PdepUser {
  return {
    githubUsername: "juangarcia",
    name: "Juan García",
    image: "",
    isAdmin: false,
    ...overrides,
  };
}

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const entrega = new Entrega();
  entrega.id = "e1";
  entrega.repoName = "kata-funcional-juangarcia";
  entrega.repoUrl = "https://github.com/pdep-mn-utn/kata-funcional-juangarcia";
  entrega.githubUsernames = ["juangarcia"];
  entrega.createdAt = new Date();
  return Object.assign(entrega, overrides);
}

function makeRequest(): Request {
  return new Request("http://localhost/api/assignments/a1/accept", {
    method: "POST",
  });
}

describe("POST /api/assignments/[id]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUser());
    mockCheckRateLimit.mockReturnValue(true);
    mockAceptarAssignment.mockResolvedValue(makeEntrega());
  });

  it("devuelve 429 cuando el rate limit está activo", async () => {
    mockCheckRateLimit.mockReturnValue(false);
    const response = await POST(makeRequest(), { params: { id: "a1" } });
    expect(response.status).toBe(429);
    expect(mockAceptarAssignment).not.toHaveBeenCalled();
  });

  it("pasa la clave correcta al rate limiter", async () => {
    await POST(makeRequest(), { params: { id: "a1" } });
    expect(mockCheckRateLimit).toHaveBeenCalledWith("juangarcia:a1");
  });

  it("devuelve 200 con la entrega del servicio", async () => {
    const response = await POST(makeRequest(), { params: { id: "a1" } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.repoName).toBe("kata-funcional-juangarcia");
    expect(mockAceptarAssignment).toHaveBeenCalledWith("a1", expect.objectContaining({
      githubUsername: "juangarcia",
    }));
  });

  it("mantiene idempotencia si se acepta dos veces el mismo assignment", async () => {
    const entrega = makeEntrega();
    mockAceptarAssignment.mockResolvedValue(entrega);

    const firstResponse = await POST(makeRequest(), { params: { id: "a1" } });
    const secondResponse = await POST(makeRequest(), { params: { id: "a1" } });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const firstData = await firstResponse.json();
    const secondData = await secondResponse.json();
    expect(firstData.id).toBe(secondData.id);
    expect(firstData.repoName).toBe(secondData.repoName);
    expect(mockAceptarAssignment).toHaveBeenCalledTimes(2);
  });

  it("mantiene una única entrega ante aceptación concurrente por miembros del mismo grupo", async () => {
    const entrega = makeEntrega({
      id: "e-grupo",
      repoName: "kata-funcional-los-lambdas",
      githubUsernames: ["juangarcia", "marialopez"],
    });
    mockRequireUser
      .mockResolvedValueOnce(makeUser({ githubUsername: "juangarcia" }))
      .mockResolvedValueOnce(makeUser({ githubUsername: "marialopez" }));
    mockAceptarAssignment.mockResolvedValue(entrega);

    const [firstResponse, secondResponse] = await Promise.all([
      POST(makeRequest(), { params: { id: "a1" } }),
      POST(makeRequest(), { params: { id: "a1" } }),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const firstData = await firstResponse.json();
    const secondData = await secondResponse.json();
    expect(firstData.id).toBe("e-grupo");
    expect(secondData.id).toBe("e-grupo");
    expect(firstData.repoName).toBe("kata-funcional-los-lambdas");
    expect(secondData.repoName).toBe("kata-funcional-los-lambdas");
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockAceptarAssignment.mockRejectedValue(new FakeAssignmentNoEncontradoError("Assignment no encontrado"));
    const response = await POST(makeRequest(), { params: { id: "no-existe" } });
    expect(response.status).toBe(404);
  });

  it("devuelve 400 si assignment grupal y el usuario no tiene grupo", async () => {
    mockAceptarAssignment.mockRejectedValue(new GrupoNoAsignadoError("a1", "juangarcia"));
    const response = await POST(makeRequest(), { params: { id: "a1" } });
    expect(response.status).toBe(400);
  });

  it("devuelve 400 si el alumno no está registrado para una entrega individual", async () => {
    mockAceptarAssignment.mockRejectedValue(new FakeAlumnoNoRegistradoError("Completá tu registro"));
    const response = await POST(makeRequest(), { params: { id: "a1" } });
    expect(response.status).toBe(400);
  });

  it("devuelve 500 si requireUser lanza", async () => {
    mockRequireUser.mockRejectedValue(new Error("redirect"));
    const response = await POST(makeRequest(), { params: { id: "a1" } });
    expect(response.status).toBe(500);
  });
});
