import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Mocks ────────────────────────────────────────────────────

const mockGuardAdmin = vi.fn();
const mockSetInscripcionesCerradas = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  guardAdmin: () => mockGuardAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  setInscripcionesCerradas: (id: string, cerrada: boolean) =>
    mockSetInscripcionesCerradas(id, cerrada),
}));

import { PATCH } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides = {}) {
  return {
    id: "a1",
    inscripcionesCerradas: false,
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/assignments/a1/inscripciones", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("PATCH /api/assignments/[id]/inscripciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardAdmin.mockResolvedValue(null);
    mockSetInscripcionesCerradas.mockResolvedValue(makeAssignment());
  });

  it("devuelve 401 si no es admin", async () => {
    mockGuardAdmin.mockResolvedValue(
      NextResponse.json({ error: "No autorizado" }, { status: 401 })
    );
    const response = await PATCH(makeRequest({ cerrada: true }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(401);
    expect(mockSetInscripcionesCerradas).not.toHaveBeenCalled();
  });

  it("cierra las inscripciones y devuelve 200", async () => {
    mockSetInscripcionesCerradas.mockResolvedValue(
      makeAssignment({ inscripcionesCerradas: true })
    );
    const response = await PATCH(makeRequest({ cerrada: true }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.inscripcionesCerradas).toBe(true);
    expect(mockSetInscripcionesCerradas).toHaveBeenCalledWith("a1", true);
  });

  it("abre las inscripciones y devuelve 200", async () => {
    mockSetInscripcionesCerradas.mockResolvedValue(
      makeAssignment({ inscripcionesCerradas: false })
    );
    const response = await PATCH(makeRequest({ cerrada: false }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.inscripcionesCerradas).toBe(false);
    expect(mockSetInscripcionesCerradas).toHaveBeenCalledWith("a1", false);
  });

  it("devuelve 400 si el body no tiene el campo cerrada", async () => {
    const response = await PATCH(makeRequest({}), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(400);
    expect(mockSetInscripcionesCerradas).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el assignment grupal no existe", async () => {
    mockSetInscripcionesCerradas.mockResolvedValue(null);
    const response = await PATCH(makeRequest({ cerrada: true }), { params: Promise.resolve({ id: "no-existe" }) });
    expect(response.status).toBe(404);
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockSetInscripcionesCerradas.mockRejectedValue(new Error("DB exploded"));
    const response = await PATCH(makeRequest({ cerrada: true }), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(500);
  });
});
