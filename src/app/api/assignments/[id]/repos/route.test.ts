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
  const a = new IndividualAssignment();
  a.id = "a1";
  a.titulo = "Kata Funcional";
  a.templateRepo = "kata-template";
  a.tipo = "individual";
  a.paradigma = "funcional";
  a.slug = "kata-funcional";
  a.createdAt = new Date("2026-01-01");
  return Object.assign(a, overrides);
}

function makeEntrega(repoName?: string): Entrega {
  const e = new Entrega();
  e.id = crypto.randomUUID();
  e.repoName = repoName;
  e.repoUrl = repoName ? `https://github.com/org/${repoName}` : undefined;
  e.githubUsernames = ["alumno1"];
  e.createdAt = new Date();
  return e;
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
    const res = await DELETE(makeRequest(), { params: { id: "a1" } });
    expect(res.status).toBe(401);
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    const res = await DELETE(makeRequest(), { params: { id: "no-existe" } });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("no encontrado");
  });

  it("elimina todos los repos y devuelve ok: true con el conteo", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregas.mockResolvedValue([
      makeEntrega("kata-funcional-alumno1"),
      makeEntrega("kata-funcional-alumno2"),
    ]);

    const res = await DELETE(makeRequest(), { params: { id: "a1" } });

    expect(res.status).toBe(200);
    const data = await res.json();
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

    const res = await DELETE(makeRequest(), { params: { id: "a1" } });

    const data = await res.json();
    expect(data.deleted).toBe(1);
    expect(mockDeleteRepo).toHaveBeenCalledTimes(1);
    expect(mockDeleteRepo).toHaveBeenCalledWith("kata-funcional-alumno1");
  });

  it("devuelve deleted: 0 si no hay entregas con repo", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregas.mockResolvedValue([]);

    const res = await DELETE(makeRequest(), { params: { id: "a1" } });

    expect(res.status).toBe(200);
    const data = await res.json();
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
