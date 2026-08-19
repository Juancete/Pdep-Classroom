import { describe, it, expect, vi, beforeEach } from "vitest";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities/RolDeUsuario";

const mockGetCurrentUser = vi.fn();
const mockGetEntregasConRepoActivo = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockSincronizar = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getEntregasConRepoActivo: (assignmentId: string) => mockGetEntregasConRepoActivo(assignmentId),
  getEntregaDeUsuario: (assignmentId: string, githubUsername: string) =>
    mockGetEntregaDeUsuario(assignmentId, githubUsername),
}));

vi.mock("@/lib/services/sincronizarAutograding", () => ({
  sincronizarAutogradingDeEntregas: (entregas: unknown[], opts: unknown) =>
    mockSincronizar(entregas, opts),
}));

import { POST } from "./route";

function makeRequest(body: unknown = {}): Request {
  return new Request("http://localhost/api/assignments/a1/autograding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assignments/[id]/autograding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSincronizar.mockResolvedValue({ actualizadas: 1, omitidas: 0, fallidas: [] });
  });

  it("devuelve 401 sin sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(401);
    expect(mockSincronizar).not.toHaveBeenCalled();
  });

  it("un admin sincroniza todas las entregas con repo activo del assignment", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);

    const response = await POST(makeRequest({ forzar: true }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockGetEntregasConRepoActivo).toHaveBeenCalledWith("a1");
    expect(mockGetEntregaDeUsuario).not.toHaveBeenCalled();
    expect(mockSincronizar).toHaveBeenCalledWith(
      [{ id: "e1" }, { id: "e2" }],
      { forzar: true }
    );
  });

  it("un alumno sólo sincroniza su propia entrega, ignorando cualquier entregaId del body", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "ana", rol: ESTUDIANTE });
    mockGetEntregaDeUsuario.mockResolvedValue({ id: "e-ana" });

    const response = await POST(makeRequest({ entregaId: "otra-entrega" }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockGetEntregaDeUsuario).toHaveBeenCalledWith("a1", "ana");
    expect(mockGetEntregasConRepoActivo).not.toHaveBeenCalled();
    expect(mockSincronizar).toHaveBeenCalledWith([{ id: "e-ana" }], { forzar: undefined });
  });

  it("un alumno sin entrega sincroniza una lista vacía", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "ana", rol: ESTUDIANTE });
    mockGetEntregaDeUsuario.mockResolvedValue(null);

    await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });

    expect(mockSincronizar).toHaveBeenCalledWith([], { forzar: undefined });
  });

  it("devuelve 400 si el body no matchea el schema", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    const response = await POST(makeRequest({ forzar: "sí" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(400);
    expect(mockSincronizar).not.toHaveBeenCalled();
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockRejectedValue(new Error("DB caída"));
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(500);
  });
});
