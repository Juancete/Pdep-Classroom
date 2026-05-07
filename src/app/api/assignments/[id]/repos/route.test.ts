import { describe, it, expect, vi, beforeEach } from "vitest";
import { IndividualAssignment } from "@/domain/entities";
import { Entrega } from "@/domain/entities/Entrega";

// ── Mocks ────────────────────────────────────────────────────

const mockGuardAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetEntregas = vi.fn();
const mockDeleteRepo = vi.fn();
const mockClearReposDeAssignment = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  guardAdmin: () => mockGuardAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getEntregas: (id: string) => mockGetEntregas(id),
  clearReposDeAssignment: (id: string) => mockClearReposDeAssignment(id),
}));

vi.mock("@/lib/github", () => ({
  deleteRepo: (name: string) => mockDeleteRepo(name),
}));

import { DELETE } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides?: Partial<IndividualAssignment>): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.templateRepo = "kata-template";
  assignment.tipo = "individual";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date("2026-01-01");
  return Object.assign(assignment, overrides);
}

function makeEntrega(repoName?: string): Entrega {
  const entrega = new Entrega();
  entrega.id = crypto.randomUUID();
  entrega.repoName = repoName;
  entrega.repoUrl = repoName ? `https://github.com/org/${repoName}` : undefined;
  entrega.githubUsernames = ["alumno1"];
  entrega.createdAt = new Date();
  return entrega;
}

function makeRequest(): Request {
  return new Request("http://localhost/api/assignments/a1/repos", {
    method: "DELETE",
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("DELETE /api/assignments/[id]/repos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardAdmin.mockResolvedValue(null);
    mockDeleteRepo.mockResolvedValue(undefined);
    mockClearReposDeAssignment.mockResolvedValue(undefined);
  });

  it("devuelve 401 si no es admin", async () => {
    mockGuardAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 })
    );
    const response = await DELETE(makeRequest(), { params: { id: "a1" } });
    expect(response.status).toBe(401);
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    const response = await DELETE(makeRequest(), { params: { id: "no-existe" } });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("no encontrado");
  });

  it("elimina todos los repos y devuelve ok: true con el conteo", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregas.mockResolvedValue([
      makeEntrega("kata-funcional-alumno1"),
      makeEntrega("kata-funcional-alumno2"),
    ]);

    const response = await DELETE(makeRequest(), { params: { id: "a1" } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.deleted).toBe(2);
  });

  it("llama a deleteRepo por cada entrega con repo", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregas.mockResolvedValue([
      makeEntrega("kata-funcional-alumno1"),
      makeEntrega("kata-funcional-alumno2"),
    ]);

    await DELETE(makeRequest(), { params: { id: "a1" } });

    expect(mockDeleteRepo).toHaveBeenCalledTimes(2);
    expect(mockDeleteRepo).toHaveBeenCalledWith("kata-funcional-alumno1");
    expect(mockDeleteRepo).toHaveBeenCalledWith("kata-funcional-alumno2");
  });

  it("ignora entregas sin repo asignado", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregas.mockResolvedValue([
      makeEntrega("kata-funcional-alumno1"),
      makeEntrega(undefined), // pendiente, sin repo
    ]);

    const response = await DELETE(makeRequest(), { params: { id: "a1" } });

    const data = await response.json();
    expect(data.deleted).toBe(1);
    expect(mockDeleteRepo).toHaveBeenCalledTimes(1);
    expect(mockDeleteRepo).toHaveBeenCalledWith("kata-funcional-alumno1");
  });

  it("devuelve deleted: 0 si no hay entregas con repo", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregas.mockResolvedValue([]);

    const response = await DELETE(makeRequest(), { params: { id: "a1" } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.deleted).toBe(0);
    expect(mockDeleteRepo).not.toHaveBeenCalled();
  });

  it("llama a getEntregas con el id del assignment correcto", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment({ id: "tp-logico" }));
    mockGetEntregas.mockResolvedValue([]);

    await DELETE(makeRequest(), { params: { id: "tp-logico" } });

    expect(mockGetEntregas).toHaveBeenCalledWith("tp-logico");
  });

  it("limpia los repos de las entregas en la DB tras borrarlos en GitHub", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment({ id: "a1" }));
    mockGetEntregas.mockResolvedValue([makeEntrega("kata-funcional-alumno1")]);

    await DELETE(makeRequest(), { params: { id: "a1" } });

    expect(mockClearReposDeAssignment).toHaveBeenCalledWith("a1");
  });

  it("no llama a clearReposDeAssignment si no hay repos que borrar", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregas.mockResolvedValue([makeEntrega(undefined)]);

    await DELETE(makeRequest(), { params: { id: "a1" } });

    expect(mockClearReposDeAssignment).not.toHaveBeenCalled();
  });
});
