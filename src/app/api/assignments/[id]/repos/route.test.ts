import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PdepUser } from "@/types";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities";

const mockGetCurrentUser = vi.fn();
const mockGetAssignment = vi.fn();
const mockBorrarRepositorios = vi.fn();
const mockConLock = vi.fn();
const mockGetEntregasConRepoActivo = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getEntregasConRepoActivo: (id: string) => mockGetEntregasConRepoActivo(id),
  conLockBorradoReposAssignment: (
    assignmentId: string,
    operation: () => Promise<unknown>
  ) => mockConLock(assignmentId, operation),
}));

vi.mock("@/lib/services/borrarRepositoriosDeAssignment", () => ({
  borrarRepositoriosDeAssignment: (data: unknown) => mockBorrarRepositorios(data),
}));

import { DELETE, GET } from "./route";

function admin(): PdepUser {
  return {
    githubUsername: "docente",
    name: "Docente",
    image: "",
    rol: DOCENTE,
  };
}

function result(overrides = {}) {
  return {
    ok: true,
    operationId: "op-1",
    attempted: 2,
    deleted: 2,
    alreadyAbsent: 0,
    failed: 0,
    results: [],
    ...overrides,
  };
}

function makeRequest(): Request {
  return new Request("http://localhost/api/assignments/a1/repos", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "kata" }),
  });
}

describe("DELETE /api/assignments/[id]/repos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(admin());
    mockGetAssignment.mockResolvedValue({
      id: "a1",
      titulo: "Kata",
      slug: "kata",
      estadoNombre: "archivado",
    });
    mockGetEntregasConRepoActivo.mockResolvedValue([]);
    mockBorrarRepositorios.mockResolvedValue(result());
    mockConLock.mockImplementation(
      async (_assignmentId: string, operation: () => Promise<unknown>) =>
        operation()
    );
  });

  it.each([
    ["sin sesión", null],
    ["sin rol admin", { ...admin(), rol: ESTUDIANTE }],
  ])("devuelve 401 %s", async (_case, user) => {
    mockGetCurrentUser.mockResolvedValue(user);

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(401);
    expect(mockBorrarRepositorios).not.toHaveBeenCalled();
  });

  it("devuelve 404 si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "no-existe" }),
    });

    expect(response.status).toBe(404);
    expect(mockBorrarRepositorios).not.toHaveBeenCalled();
  });

  it("exige archivar el assignment antes de borrar repos", async () => {
    mockGetAssignment.mockResolvedValue({
      id: "a1",
      titulo: "Kata",
      slug: "kata",
      estadoNombre: "publicado",
    });

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(409);
    expect(mockBorrarRepositorios).not.toHaveBeenCalled();
  });

  it("exige escribir el slug exacto para confirmar", async () => {
    const request = new Request("http://localhost/api/assignments/a1/repos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "otro" }),
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(400);
    expect(mockBorrarRepositorios).not.toHaveBeenCalled();
  });

  it("propaga el actor autenticado al servicio", async () => {
    await DELETE(makeRequest(), { params: Promise.resolve({ id: "a1" }) });

    expect(mockBorrarRepositorios).toHaveBeenCalledWith({
      assignmentId: "a1",
      requestedBy: "docente",
    });
    expect(mockConLock).toHaveBeenCalledWith("a1", expect.any(Function));
  });

  it("devuelve 200 con el resumen de éxito", async () => {
    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result());
  });

  it("devuelve 200 y ok=false para un resultado parcial", async () => {
    mockBorrarRepositorios.mockResolvedValue(
      result({ ok: false, deleted: 1, failed: 1 })
    );

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      deleted: 1,
      failed: 1,
    });
  });

  it("devuelve un lote vacío sin inventar una operación", async () => {
    mockBorrarRepositorios.mockResolvedValue(
      result({
        operationId: null,
        attempted: 0,
        deleted: 0,
      })
    );

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "a1" }),
    });

    await expect(response.json()).resolves.toMatchObject({
      operationId: null,
      attempted: 0,
    });
  });

  it("devuelve 500 para fallos previos al procesamiento", async () => {
    mockGetAssignment.mockRejectedValue(new Error("DB caída"));

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(500);
  });

  it("devuelve un 500 genérico si falla el borrado", async () => {
    mockBorrarRepositorios.mockRejectedValue(
      new Error("GitHub devolvió información interna")
    );

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "a1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Error interno del servidor" });
    expect(JSON.stringify(body)).not.toContain("información interna");
  });
});

describe("GET /api/assignments/[id]/repos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(admin());
    mockGetAssignment.mockResolvedValue({
      id: "a1",
      titulo: "Kata",
      slug: "kata",
      estadoNombre: "archivado",
    });
    mockGetEntregasConRepoActivo.mockResolvedValue([
      { repoName: "kata-ana" },
      { repoName: "kata-bruno" },
    ]);
  });

  it("previsualiza la lista exacta que se va a borrar", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      slug: "kata",
      estado: "archivado",
      repos: ["kata-ana", "kata-bruno"],
    });
  });
});
