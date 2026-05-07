import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PdepUser } from "@/types";
import {
  IndividualAssignment,
  GrupalAssignment,
  Entrega,
  type Assignment,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockCreateEntrega = vi.fn();
const mockCrearEntrega = vi.fn();
const mockRepoExists = vi.fn();
const mockAddCollaborators = vi.fn();
const mockGetGrupoDeAlumno = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string) => mockCheckRateLimit(key),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getEntregaDeUsuario: (assignmentId: string, username: string) =>
    mockGetEntregaDeUsuario(assignmentId, username),
  createEntrega: (data: unknown) => mockCreateEntrega(data),
  getGrupoDeAlumnoEnAssignment: (assignmentId: string, username: string) =>
    mockGetGrupoDeAlumno(assignmentId, username),
}));

vi.mock("@/lib/github", () => ({
  crearEntrega: (opts: unknown) => mockCrearEntrega(opts),
  repoExists: (name: string) => mockRepoExists(name),
  addCollaborators: (repoName: string, usernames: string[]) => mockAddCollaborators(repoName, usernames),
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

type AssignmentOverrides = Partial<IndividualAssignment & GrupalAssignment>;

function makeAssignment(overrides?: AssignmentOverrides): Assignment {
  const assignment: Assignment =
    overrides?.tipo === "grupal"
      ? Object.assign(new GrupalAssignment(), { maxIntegrantes: 4 })
      : new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.descripcion = "";
  assignment.templateRepo = "kata-template";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date("2026-01-01");
  return Object.assign(assignment, overrides);
}

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const entrega = new Entrega();
  entrega.id = "e1";
  entrega.repoName = "kata-funcional-juangarcia";
  entrega.repoUrl = "https://github.com/pdep-mn-utn/kata-funcional-juangarcia";
  entrega.githubUsernames = ["juangarcia"];
  entrega.createdAt = new Date();
  return Object.assign(entrega, overrides);
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
      const response = await POST(makeRequest(), { params: { id: "a1" } });
      expect(response.status).toBe(429);
      const data = await response.json();
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
      const response = await POST(makeRequest(), { params: { id: "a1" } });
      expect(response.status).toBe(500);
    });
  });

  describe("validaciones", () => {
    it("devuelve 404 si el assignment no existe", async () => {
      mockGetAssignment.mockResolvedValue(undefined);
      const response = await POST(makeRequest(), { params: { id: "no-existe" } });
      expect(response.status).toBe(404);
    });

    it("devuelve 409 si el usuario ya tiene entrega", async () => {
      mockGetEntregaDeUsuario.mockResolvedValue(makeEntrega());
      const response = await POST(makeRequest(), { params: { id: "a1" } });
      expect(response.status).toBe(409);
    });

    it("devuelve 400 si assignment grupal y el usuario no tiene grupo", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ tipo: "grupal" }));
      mockGetGrupoDeAlumno.mockResolvedValue(undefined);
      const response = await POST(makeRequest(), { params: { id: "a1" } });
      expect(response.status).toBe(400);
    });
  });

  describe("creación exitosa (individual)", () => {
    it("devuelve 200 con la entrega creada", async () => {
      const response = await POST(makeRequest(), { params: { id: "a1" } });
      expect(response.status).toBe(200);
      const data = await response.json();
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

  describe("creación exitosa (grupal)", () => {
    function makeGrupo(githubUsernames: string[], id = "los-lambdas") {
      return {
        id,
        nombre: "Los Lambdas",
        alumnos: { getItems: () => githubUsernames.map((username) => ({ githubUsername: username })) },
        usernamesDeMiembros: () => githubUsernames,
      };
    }

    it("devuelve 200 con la entrega creada para el grupo", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ tipo: "grupal" }));
      mockGetGrupoDeAlumno.mockResolvedValue(
        makeGrupo(["juangarcia", "mariaperez"])
      );
      mockCrearEntrega.mockResolvedValue({
        repoName: "kata-funcional-los-lambdas",
        repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-los-lambdas",
      });
      mockCreateEntrega.mockResolvedValue(
        makeEntrega({ repoName: "kata-funcional-los-lambdas" })
      );
      const response = await POST(makeRequest(), { params: { id: "a1" } });
      expect(response.status).toBe(200);
    });

    it("llama a crearEntrega con los usernames del grupo", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ tipo: "grupal" }));
      mockGetGrupoDeAlumno.mockResolvedValue(
        makeGrupo(["juangarcia", "mariaperez"])
      );
      mockCrearEntrega.mockResolvedValue({
        repoName: "kata-funcional-los-lambdas",
        repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-los-lambdas",
      });
      mockCreateEntrega.mockResolvedValue(makeEntrega());
      await POST(makeRequest(), { params: { id: "a1" } });
      expect(mockCrearEntrega).toHaveBeenCalledWith(
        expect.objectContaining({
          usernames: ["juangarcia", "mariaperez"],
          grupoId: "los-lambdas",
        })
      );
    });

    it("busca el grupo por assignmentId, no por paradigma", async () => {
      mockGetAssignment.mockResolvedValue(
        makeAssignment({ id: "a1", tipo: "grupal" })
      );
      mockGetGrupoDeAlumno.mockResolvedValue(makeGrupo(["juangarcia"], "g1"));
      mockCrearEntrega.mockResolvedValue({
        repoName: "kata-funcional-grupo-x",
        repoUrl: "https://github.com/pdep-mn-utn/kata-funcional-grupo-x",
      });
      mockCreateEntrega.mockResolvedValue(makeEntrega());
      await POST(makeRequest(), { params: { id: "a1" } });
      expect(mockGetGrupoDeAlumno).toHaveBeenCalledWith("a1", "juangarcia");
    });
  });

  describe("repo ya existe", () => {
    beforeEach(() => {
      mockRepoExists.mockResolvedValue(true);
      mockAddCollaborators.mockResolvedValue(undefined);
    });

    it("registra la entrega sin crear un nuevo repo si ya existe", async () => {
      const response = await POST(makeRequest(), { params: { id: "a1" } });
      expect(response.status).toBe(200);
      expect(mockCrearEntrega).not.toHaveBeenCalled();
      expect(mockCreateEntrega).toHaveBeenCalled();
    });

    it("agrega al usuario como colaborador del repo existente", async () => {
      await POST(makeRequest(), { params: { id: "a1" } });
      expect(mockAddCollaborators).toHaveBeenCalledWith(
        expect.any(String),
        ["juangarcia"]
      );
    });
  });
});
