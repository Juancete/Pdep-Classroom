import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import { Alumno, IndividualAssignment, GrupalAssignment, Entrega } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockGetAssignments = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockGetGruposDeAlumno = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignments: () => mockGetAssignments(),
  getEntregasDeUsuario: (username: string) => mockGetEntregaDeUsuario(username),
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getComisionActiva: () => mockGetComisionActiva(),
  getGruposDeAlumno: (username: string) => mockGetGruposDeAlumno(username),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("./accept-button", () => ({
  AcceptButton: ({ assignmentId }: { assignmentId: string }) => (
    <button data-testid="accept-button" data-assignment={assignmentId}>
      Aceptar TP
    </button>
  ),
}));

import DashboardPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  const alumno = new Alumno();
  alumno.githubUsername = "testuser";
  alumno.legajo = "12345";
  alumno.nombre = "Test";
  alumno.apellido = "User";
  alumno.email = "test@example.com";
  alumno.gruposSyncFallidoEn = null;
  alumno.alumnoSyncFallidoEn = null;
  return Object.assign(alumno, overrides);
}

function makeUser(overrides?: Partial<PdepUser>): PdepUser {
  return {
    githubUsername: "testuser",
    name: "Test User",
    image: "",
    isAdmin: false,
    ...overrides,
  };
}

function makeAssignment(overrides?: Partial<IndividualAssignment>): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.descripcion = "";
  assignment.templateRepo = "kata-template";
  assignment.tipo = "individual";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date();
  return Object.assign(assignment, overrides);
}

function makeGrupalAssignment(overrides?: Partial<GrupalAssignment>): GrupalAssignment {
  const assignment = new GrupalAssignment();
  assignment.id = "a-grupal";
  assignment.titulo = "TP Grupal";
  assignment.descripcion = "";
  assignment.templateRepo = "tp-template";
  assignment.tipo = "grupal";
  assignment.paradigma = "objetos";
  assignment.slug = "tp-grupal";
  assignment.maxIntegrantes = 3;
  assignment.createdAt = new Date();
  return Object.assign(assignment, overrides);
}

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const entrega = new Entrega();
  entrega.id = "e1";
  entrega.repoName = "kata-funcional-testuser";
  entrega.repoUrl = "https://github.com/pdep-mn-utn/kata-funcional-testuser";
  entrega.githubUsernames = ["testuser"];
  entrega.createdAt = new Date();
  return Object.assign(entrega, overrides);
}

// ── Tests ────────────────────────────────────────────────────

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    mockGetAssignments.mockResolvedValue([]);
    mockGetEntregaDeUsuario.mockResolvedValue(new Map());
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
    mockGetAlumnoByGithub.mockResolvedValue(null);
    mockGetGruposDeAlumno.mockResolvedValue(new Map());
  });

  describe("redirecciones", () => {
    it("redirige a /registro si el alumno no existe en la DB y no es admin", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: false }));
      mockGetAlumnoByGithub.mockResolvedValue(null);

      await expect(DashboardPage()).rejects.toThrow("REDIRECT:/registro");
      expect(mockRedirect).toHaveBeenCalledWith("/registro");
    });

    it("redirige a /registro si el alumno confirmó en otra comisión (recursante)", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: false }));
      mockGetComisionActiva.mockResolvedValue({ id: "c2" });
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );

      await expect(DashboardPage()).rejects.toThrow("REDIRECT:/registro");
    });

    it("redirige a /registro si el alumno nunca confirmó (registroConfirmadoEn null)", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: false }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: undefined })
      );

      await expect(DashboardPage()).rejects.toThrow("REDIRECT:/registro");
    });

    it("no redirige si el alumno confirmó para la comisión activa", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: false }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );

      const element = await DashboardPage();
      expect(element).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("no redirige si no hay comisión activa (deja pasar aunque no haya confirmado)", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: false }));
      mockGetComisionActiva.mockResolvedValue(null);
      mockGetAlumnoByGithub.mockResolvedValue(null);

      const element = await DashboardPage();
      expect(element).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("no redirige a /registro aunque no esté registrado si es admin", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: true }));

      const element = await DashboardPage();
      expect(element).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
    });
  });

  describe("estado vacío", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: true }));
      mockGetAssignments.mockResolvedValue([]);
    });

    it("muestra mensaje cuando no hay assignments", async () => {
      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay assignments publicados todavía");
    });
  });

  describe("con assignments", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: true }));
    });

    it("muestra el título del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ titulo: "TP Funcional" }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("TP Funcional");
    });

    it("muestra el paradigma del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ paradigma: "logico" }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("logico");
    });

    it("muestra el tipo del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ tipo: "grupal" }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("grupal");
    });

    it("muestra la descripción si está presente", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ descripcion: "Una kata introductoria" }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Una kata introductoria");
    });

    it("no muestra la descripción si está vacía", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ descripcion: "" }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      // La clase del párrafo de descripción no debe estar
      expect(html).not.toContain("text-sm text-gray-500");
    });

    it("muestra el deadline formateado si está presente", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ deadline: new Date("2026-06-15") }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Entrega:");
    });

    it("no muestra la sección de deadline si no está presente", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ deadline: undefined }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Entrega:");
    });
  });

  describe("render condicional según entrega", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: true }));
      mockGetAssignments.mockResolvedValue([makeAssignment()]);
    });

    it("muestra AcceptButton cuando no hay entrega", async () => {
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("data-testid=\"accept-button\"");
      expect(html).not.toContain("Ir al repo");
    });

    it("muestra el link al repo cuando ya hay entrega", async () => {
      const entrega = makeEntrega({ repoUrl: "https://github.com/pdep-mn-utn/kata-testuser" });
      mockGetEntregaDeUsuario.mockResolvedValue(new Map([["a1", entrega]]));

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Ir al repo");
      expect(html).toContain("https://github.com/pdep-mn-utn/kata-testuser");
      expect(html).not.toContain("data-testid=\"accept-button\"");
    });

    it("pasa el assignmentId correcto al AcceptButton", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ id: "assignment-123" }),
      ]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-assignment="assignment-123"');
    });

    it("consulta las entregas usando el username del usuario actual", async () => {
      mockRequireUser.mockResolvedValue(
        makeUser({ githubUsername: "miusuario", isAdmin: true })
      );
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "tp-1" })]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      await DashboardPage();
      expect(mockGetEntregaDeUsuario).toHaveBeenCalledWith("miusuario");
    });
  });

  describe("assignments grupales", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: false }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );
    });

    it("muestra 'Elegir grupo' cuando es grupal y el alumno no tiene grupo", async () => {
      mockGetAssignments.mockResolvedValue([makeGrupalAssignment()]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());
      mockGetGruposDeAlumno.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Elegir grupo");
      expect(html).not.toContain("data-testid=\"accept-button\"");
    });

    it("el link 'Elegir grupo' apunta a la página del grupo del assignment", async () => {
      mockGetAssignments.mockResolvedValue([makeGrupalAssignment({ id: "tp-g1" })]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());
      mockGetGruposDeAlumno.mockResolvedValue(new Map());

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("/assignments/tp-g1/grupo");
    });

    it("muestra AcceptButton cuando es grupal y el alumno ya tiene grupo", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      mockGetAssignments.mockResolvedValue([grupalAssignment]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-g1", { nombre: "Los Lambdas" }]])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("data-testid=\"accept-button\"");
      expect(html).not.toContain("Elegir grupo");
    });

    it("muestra el nombre del grupo cuando el alumno ya tiene grupo sin entrega", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      mockGetAssignments.mockResolvedValue([grupalAssignment]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-g1", { nombre: "Los Lambdas" }]])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Los Lambdas");
    });

    it("muestra 'Ir al repo' cuando ya tiene entrega, aunque tenga grupo", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      const entrega = makeEntrega({ repoUrl: "https://github.com/pdep/tp-g1" });
      mockGetAssignments.mockResolvedValue([grupalAssignment]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map([["tp-g1", entrega]]));
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-g1", { nombre: "Los Lambdas" }]])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Ir al repo");
      expect(html).not.toContain("Elegir grupo");
    });

    it("no llama a getGruposDeAlumno si el usuario es admin", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ isAdmin: true }));
      mockGetAssignments.mockResolvedValue([makeGrupalAssignment()]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());

      await DashboardPage();
      expect(mockGetGruposDeAlumno).not.toHaveBeenCalled();
    });
  });

  describe("header", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(
        makeUser({ githubUsername: "miusuario", isAdmin: true })
      );
      mockGetAssignments.mockResolvedValue([]);
    });

    it("muestra el username en el saludo", async () => {
      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("miusuario");
    });

    it("muestra el título principal", async () => {
      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Mis Trabajos Prácticos");
    });
  });
});
