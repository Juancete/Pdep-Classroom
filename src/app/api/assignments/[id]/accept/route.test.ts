import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Assignment, Entrega, PdepUser } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockCreateEntrega = vi.fn();
const mockCrearEntrega = vi.fn();
const mockRepoExists = vi.fn();
const mockGetGrupoDeAlumno = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string) => mockCheckRateLimit(key),
}));

vi.mock("@/lib/store", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getEntregaDeUsuario: (assignmentId: string, username: string) =>
    mockGetEntregaDeUsuario(assignmentId, username),
  createEntrega: (data: unknown) => mockCreateEntrega(data),
}));

vi.mock("@/lib/github", () => ({
  crearEntrega: (opts: unknown) => mockCrearEntrega(opts),
  repoExists: (name: string) => mockRepoExists(name),
}));

vi.mock("@/lib/sheets", () => ({
  getGrupoDeAlumno: (username: string, paradigma: string) =>
    mockGetGrupoDeAlumno(username, paradigma),
}));

import { POST } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeUser(overrides?: Partial<PdepUser>): PdepUser {
  return {
    githubUsername: "juangarcia",
    name: "Juan García",
    image: "",
    isAdmin: false,
    ...overrides,
  };
}

function makeAssignment(overrides?: Partial<Assignment>): Assignment {
  return {
    id: "a1",
    titulo: "Kata Funcional",
    descripcion: "",
    templateRepo: "kata-template",
    tipo: "individual",
    paradigma: "funcional",
    deadline: "",
    createdAt: new Date("2026-01-01").toISOString(),
    slug: "kata-funcional",
    ...overrides,
  };
}

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  return {
    id: "e1",
    assignmentId: "a1",
    repoName: "kata-funcional-juangarcia",
    repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
    githubUsernames: ["juangarcia"],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRequest(): Request {
  return new Request("http://localhost/api/assignments/a1/accept", {
    method: "POST",
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("POST /api/assignments/[id]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUser());
    mockCheckRateLimit.mockReturnValue(true);
    mockGetAssignment.mockResolvedValue(makeAssignment());
    mockGetEntregaDeUsuario.mockResolvedValue(undefined);
    mockRepoExists.mockResolvedValue(false);
    mockCrearEntrega.mockResolvedValue({
      repoName: "kata-funcional-juangarcia",
      repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-juangarcia",
    });
    mockCreateEntrega.mockResolvedValue(makeEntrega());
  });

  describe("rate limiting", () => {
    it("devuelve 429 cuando el rate limit está activo", async () => {
      mockCheckRateLimit.mockReturnValue(false);
      const res = await POST(makeRequest(), { params: { id: "a1" } });
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it("pasa la clave correcta al rate limiter (username:assignmentId)", async () => {
      await POST(makeRequest(), { params: { id: "a1" } });
      expect(mockCheckRateLimit).toHaveBeenCalledWith("juangarcia:a1");
    });

    it("no consulta el store si el rate limit bloquea", async () => {
      mockCheckRateLimit.mockReturnValue(false);
      await POST(makeRequest(), { params: { id: "a1" } });
      expect(mockGetAssignment).not.toHaveBeenCalled();
    });
  });

  describe("autenticación", () => {
    it("devuelve 500 si requireUser lanza (no autenticado)", async () => {
      mockRequireUser.mockRejectedValue(new Error("redirect"));
      const res = await POST(makeRequest(), { params: { id: "a1" } });
      expect(res.status).toBe(500);
    });
  });

  describe("validaciones", () => {
    it("devuelve 404 si el assignment no existe", async () => {
      mockGetAssignment.mockResolvedValue(undefined);
      const res = await POST(makeRequest(), { params: { id: "no-existe" } });
      expect(res.status).toBe(404);
    });

    it("devuelve 409 si el usuario ya tiene entrega", async () => {
      mockGetEntregaDeUsuario.mockResolvedValue(makeEntrega());
      const res = await POST(makeRequest(), { params: { id: "a1" } });
      expect(res.status).toBe(409);
    });

    it("devuelve 400 si assignment grupal y el usuario no tiene grupo", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ tipo: "grupal" }));
      mockGetGrupoDeAlumno.mockResolvedValue(undefined);
      const res = await POST(makeRequest(), { params: { id: "a1" } });
      expect(res.status).toBe(400);
    });
  });

  describe("creación exitosa (individual)", () => {
    it("devuelve 200 con la entrega creada", async () => {
      const res = await POST(makeRequest(), { params: { id: "a1" } });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repoName).toBe("kata-funcional-juangarcia");
    });

    it("llama a crearEntrega con los parámetros correctos", async () => {
      await POST(makeRequest(), { params: { id: "a1" } });
      expect(mockCrearEntrega).toHaveBeenCalledWith(
        expect.objectContaining({
          templateRepo: "kata-template",
          slug: "kata-funcional",
          usernames: ["juangarcia"],
        })
      );
    });
  });

  describe("repo ya existe", () => {
    it("registra la entrega sin crear un nuevo repo si ya existe", async () => {
      mockRepoExists.mockResolvedValue(true);
      const res = await POST(makeRequest(), { params: { id: "a1" } });
      expect(res.status).toBe(200);
      expect(mockCrearEntrega).not.toHaveBeenCalled();
      expect(mockCreateEntrega).toHaveBeenCalled();
    });
  });
});
