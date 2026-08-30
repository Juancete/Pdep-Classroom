import { describe, it, expect, vi, beforeEach } from "vitest";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities/RolDeUsuario";
import { ReejecucionCINoDisponibleError } from "@/domain/entities/ResultadoCI";

const mockGetCurrentUser = vi.fn();
const mockGetEntregaPorId = vi.fn();
const mockReejecutar = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getEntregaPorId: (entregaId: string) => mockGetEntregaPorId(entregaId),
}));

vi.mock("@/lib/services/sincronizarCI", () => ({
  reejecutarCIDeEntrega: (entrega: unknown) => mockReejecutar(entrega),
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/assignments/a1/ci/rerun", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEntrega(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    assignment: { id: "a1" },
    puedeReejecutarCI: () => true,
    ...overrides,
  };
}

describe("POST /api/assignments/[id]/ci/rerun", () => {
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

  it("devuelve 409 si Entrega.puedeReejecutarCI() da false", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregaPorId.mockResolvedValue(
      makeEntrega({ puedeReejecutarCI: () => false })
    );
    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(409);
    expect(mockReejecutar).not.toHaveBeenCalled();
  });

  it("devuelve 409 (no 500) si el servicio igual rechaza con el error tipado", async () => {
    // Defensa en profundidad: aunque la route y el servicio llaman al mismo
    // `Entrega.puedeReejecutarCI()` (ya no pueden divergir — B1), si el
    // servicio se invocara por otra vía y rechazara con el error tipado, la
    // route lo traduce a 409 en vez de caer al 500 genérico.
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregaPorId.mockResolvedValue(makeEntrega());
    mockReejecutar.mockRejectedValue(new ReejecucionCINoDisponibleError("e1"));

    const response = await POST(makeRequest({ entregaId: "e1" }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(409);
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
