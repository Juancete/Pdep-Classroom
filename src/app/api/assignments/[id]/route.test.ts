import { describe, it, expect, vi, beforeEach } from "vitest";
import { IndividualAssignment } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockDeleteAssignment = vi.fn();
const mockUpdateAssignment = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  deleteAssignment: (id: string) => mockDeleteAssignment(id),
  updateAssignment: (id: string, data: unknown) => mockUpdateAssignment(id, data),
}));

import { DELETE, PATCH } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides?: Partial<IndividualAssignment>): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.descripcion = "";
  assignment.templateRepo = "kata-template";
  assignment.tipo = "individual";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date("2026-01-01");
  return Object.assign(assignment, overrides);
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/assignments/a1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── DELETE ───────────────────────────────────────────────────

describe("DELETE /api/assignments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockDeleteAssignment.mockResolvedValue(undefined);
  });

  it("devuelve 401 si no es admin", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("redirect"));
    const response = await DELETE(makeRequest("DELETE"), { params: { id: "a1" } });
    expect(response.status).toBe(401);
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(undefined);
    const response = await DELETE(makeRequest("DELETE"), { params: { id: "no-existe" } });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("no encontrado");
  });

  it("elimina el assignment y devuelve ok: true", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    const response = await DELETE(makeRequest("DELETE"), { params: { id: "a1" } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
  });

  it("llama a deleteAssignment con el id correcto", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment({ id: "tp-logico" }));
    await DELETE(makeRequest("DELETE"), { params: { id: "tp-logico" } });
    expect(mockDeleteAssignment).toHaveBeenCalledWith("tp-logico");
  });
});

// ── PATCH ────────────────────────────────────────────────────

describe("PATCH /api/assignments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("devuelve 401 si no es admin", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("redirect"));
    const request = makeRequest("PATCH", { titulo: "Nuevo" });
    const response = await PATCH(request, { params: { id: "a1" } });
    expect(response.status).toBe(401);
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(undefined);
    const request = makeRequest("PATCH", { titulo: "Nuevo" });
    const response = await PATCH(request, { params: { id: "no-existe" } });
    expect(response.status).toBe(404);
  });

  it("actualiza el assignment y devuelve el objeto actualizado", async () => {
    const original = makeAssignment();
    const updated = makeAssignment({ titulo: "Actualizado" });
    mockGetAssignment.mockResolvedValue(original);
    mockUpdateAssignment.mockResolvedValue(updated);

    const request = makeRequest("PATCH", { titulo: "Actualizado" });
    const response = await PATCH(request, { params: { id: "a1" } });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.titulo).toBe("Actualizado");
  });

  it("llama a updateAssignment con el id y los datos del body", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockUpdateAssignment.mockResolvedValue(makeAssignment({ paradigma: "logico" }));

    const request = makeRequest("PATCH", { paradigma: "logico" });
    await PATCH(request, { params: { id: "a1" } });
    expect(mockUpdateAssignment).toHaveBeenCalledWith("a1", { paradigma: "logico" });
  });
});
