import { describe, it, expect, vi, beforeEach } from "vitest";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities/RolDeUsuario";

const mockGetCurrentUser = vi.fn();
const mockGetEntregaPorId = vi.fn();
const mockReejecutar = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getEntregaPorId: (entregaId: string) => mockGetEntregaPorId(entregaId),
}));

vi.mock("@/lib/services/sincronizarAutograding", () => ({
  reejecutarAutogradingDeEntrega: (entrega: unknown) => mockReejecutar(entrega),
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/assignments/a1/autograding/rerun", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEntrega(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    assignment: { id: "a1" },
    resultadoAutograding: { permiteReejecucion: () => true },
    ...overrides,
  };
}

describe("POST /api/assignments/[id]/autograding/rerun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReejecutar.mockResolvedValue(undefined);
  });

  it("devuelve 401 sin sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(401);
  });

  it("devuelve 401 si el usuario no es admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "ana", rol: ESTUDIANTE });
    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(401);
    expect(mockGetEntregaPorId).not.toHaveBeenCalled();
  });

  it("devuelve 400 si falta entregaId", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    const response = await POST(makeRequest({}), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(400);
  });

  it("devuelve 404 si la entrega no existe", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregaPorId.mockResolvedValue(null);
    const response = await POST(makeRequest({ entregaId: "no-existe" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(404);
    expect(mockReejecutar).not.toHaveBeenCalled();
  });

  it("devuelve 404 si la entrega pertenece a otro assignment (mapeo repo↔entrega↔ejecución)", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregaPorId.mockResolvedValue(makeEntrega({ assignment: { id: "otro-assignment" } }));
    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(404);
    expect(mockReejecutar).not.toHaveBeenCalled();
  });

  it("devuelve 409 si el resultado actual no permite reejecución", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregaPorId.mockResolvedValue(
      makeEntrega({ resultadoAutograding: { permiteReejecucion: () => false } })
    );
    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(409);
    expect(mockReejecutar).not.toHaveBeenCalled();
  });

  it("reejecuta y devuelve 200 en el camino feliz", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    const entrega = makeEntrega();
    mockGetEntregaPorId.mockResolvedValue(entrega);

    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockReejecutar).toHaveBeenCalledWith(entrega);
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregaPorId.mockRejectedValue(new Error("DB caída"));
    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(500);
  });
});
