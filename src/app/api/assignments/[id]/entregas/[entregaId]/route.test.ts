import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { EntregaNoEncontradaError } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGuardAdmin = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockBorrarEntrega = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  guardAdmin: () => mockGuardAdmin(),
}));

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/application/borrarEntrega", () => ({
  borrarEntrega: (data: unknown) => mockBorrarEntrega(data),
}));

import { DELETE } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request(
    "http://localhost/api/assignments/a1/entregas/e1",
    { method: "DELETE" }
  );
}

function makeParams(entregaId = "e1") {
  return { params: Promise.resolve({ id: "a1", entregaId }) };
}

describe("DELETE /api/assignments/[id]/entregas/[entregaId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardAdmin.mockResolvedValue(null);
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1" });
    mockBorrarEntrega.mockResolvedValue({ ok: true, repo: "deleted" });
  });

  it("devuelve 401/403 según lo que decida guardAdmin", async () => {
    mockGuardAdmin.mockResolvedValue(
      NextResponse.json({ error: "Acceso prohibido" }, { status: 403 })
    );
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(403);
    expect(mockBorrarEntrega).not.toHaveBeenCalled();
  });

  it("borra la entrega y devuelve 200 con el resultado", async () => {
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true, repo: "deleted" });
    expect(mockBorrarEntrega).toHaveBeenCalledWith({
      assignmentId: "a1",
      entregaId: "e1",
      requestedBy: "docente1",
    });
  });

  it("devuelve 404 si la entrega no existe o no pertenece al assignment", async () => {
    mockBorrarEntrega.mockRejectedValue(new EntregaNoEncontradaError("e1"));
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it("devuelve 502 con el error cuando falla el borrado en GitHub", async () => {
    mockBorrarEntrega.mockResolvedValue({ ok: false, error: "GitHub no disponible" });
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBe("GitHub no disponible");
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockBorrarEntrega.mockRejectedValue(new Error("DB explotó"));
    const response = await DELETE(makeRequest(), makeParams());
    expect(response.status).toBe(500);
  });
});
