import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import {
  Alumno,
  Grupo,
  MiembroDeGrupo,
  IndividualAssignment,
  GrupalAssignment,
  Entrega,
  DOCENTE,
  ESTUDIANTE,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────
//
// `@/infrastructure/repositories` se mockea entero — `resolverParticipante`
// (issue #107/#112) corre real y se resuelve a través de estos mismos
// mocks (`getAlumnoByGithub`/`getComisionActiva`), sin necesidad de mockear
// `@/application/participante` por separado.

const mockRequireUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockGetAssignmentsDeComision = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockGetGruposDeAlumno = vi.fn();
const mockGetEntregasDeGrupos = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/infrastructure/auth/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAssignmentsDeComision: (comisionId: string) =>
    mockGetAssignmentsDeComision(comisionId),
  getEntregasDeUsuario: (username: string) => mockGetEntregaDeUsuario(username),
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
  getComisionActiva: () => mockGetComisionActiva(),
  getGruposDeAlumno: (username: string) => mockGetGruposDeAlumno(username),
  getEntregasDeGrupos: (filtro: { comisionId: string }) => mockGetEntregasDeGrupos(filtro),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  // CIRefreshButton (renderizado junto al link de repo) usa useRouter — no
  // hay Router context en un render estático fuera de Next.
  useRouter: () => ({ refresh: vi.fn() }),
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
    rol: ESTUDIANTE,
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
  // Publicado por defecto: el dashboard solo muestra lo visible. Los tests
  // de ciclo de vida overridean `estadoNombre` explícitamente.
  assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");
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
  assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");
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

// Issue #138: miembro de grupo de test — sin `alumno` por default (docente
// de demo, issue #107/#112), mismo molde que `fakeMiembro` en
// `Grupo.test.ts`.
function fakeMiembro(githubUsername: string, alumno: Alumno | null = null): MiembroDeGrupo {
  return Object.assign(new MiembroDeGrupo(), {
    id: `miembro-${githubUsername}`,
    githubUsername,
    alumno: alumno ?? undefined,
  });
}

// Reemplaza los grupos planos `{ nombre }` que usaban los tests: un `Grupo`
// real, con una Collection fake de `MiembroDeGrupo` (mismo molde que
// `nuevoGrupo` en `Grupo.test.ts`) — necesario desde que la tarjeta llama a
// `grupo.resumenDeIntegrantes()` (issue #138), no sólo lee `grupo.nombre`.
function makeGrupo({
  id = "g1",
  nombre = "Los Lambdas",
  miembros = [fakeMiembro("testuser")],
}: { id?: string; nombre?: string; miembros?: MiembroDeGrupo[] } = {}): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = nombre;
  grupo.nombreNormalizado = nombre;
  grupo.paradigma = "objetos";
  grupo.maxIntegrantes = 3;
  grupo.creadoPor = miembros[0]?.githubUsername ?? "alguien";
  const items = [...miembros];
  Object.assign(grupo, {
    miembros: { getItems: () => items, length: items.length },
  });
  return grupo;
}

// ── Tests ────────────────────────────────────────────────────

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    mockGetAssignmentsDeComision.mockResolvedValue([]);
    mockGetEntregaDeUsuario.mockResolvedValue(new Map());
    mockGetComisionActiva.mockResolvedValue({ id: "c1" });
    mockGetAlumnoByGithub.mockResolvedValue(null);
    mockGetGruposDeAlumno.mockResolvedValue(new Map());
    mockGetEntregasDeGrupos.mockResolvedValue(new Map());
  });

  describe("redirecciones", () => {
    it("redirige a /registro si el alumno no existe en la DB", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetAlumnoByGithub.mockResolvedValue(null);

      await expect(DashboardPage()).rejects.toThrow("REDIRECT:/registro");
      expect(mockRedirect).toHaveBeenCalledWith("/registro");
    });

    it("redirige a /registro si el alumno confirmó en otra comisión (recursante)", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetComisionActiva.mockResolvedValue({ id: "c2" });
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );

      await expect(DashboardPage()).rejects.toThrow("REDIRECT:/registro");
    });

    it("redirige a /registro si el alumno nunca confirmó (registroConfirmadoEn null)", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: undefined })
      );

      await expect(DashboardPage()).rejects.toThrow("REDIRECT:/registro");
    });

    it("no redirige si el alumno confirmó para la comisión activa", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );

      const element = await DashboardPage();
      expect(element).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it("consulta assignments de la comisión activa para alumnos", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );
      mockGetAssignmentsDeComision.mockResolvedValue([makeAssignment({ titulo: "TP Vigente" })]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);

      expect(mockGetAssignmentsDeComision).toHaveBeenCalledWith("c1");
      expect(html).toContain("TP Vigente");
    });

    it("no redirige si no hay comisión activa (deja pasar aunque no haya confirmado)", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetComisionActiva.mockResolvedValue(null);
      mockGetAlumnoByGithub.mockResolvedValue(null);

      const element = await DashboardPage();
      expect(element).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockGetAssignmentsDeComision).not.toHaveBeenCalled();
    });

    // issue #107/#112: el docente nunca se registra como alumno — jamás
    // redirige a /registro, tenga o no comisión activa.
    it("el docente nunca redirige a /registro, ni consulta Alumno", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
      mockGetComisionActiva.mockResolvedValue(null);

      const element = await DashboardPage();
      expect(element).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
    });
  });

  describe("estado vacío", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
      mockGetAssignmentsDeComision.mockResolvedValue([]);
    });

    it("muestra mensaje cuando no hay assignments", async () => {
      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay assignments publicados todavía");
    });
  });

  describe("con assignments", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    });

    it("muestra el título del assignment", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ titulo: "TP Funcional" }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("TP Funcional");
    });

    it("muestra el paradigma del assignment", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ paradigma: "logico" }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("logico");
    });

    it("muestra el tipo del assignment", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ tipo: "grupal" }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("grupal");
    });

    it("muestra la descripción si está presente", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ descripcion: "Una kata introductoria" }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Una kata introductoria");
    });

    it("no muestra la descripción si está vacía", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ descripcion: "" }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      // La clase del párrafo de descripción no debe estar
      expect(html).not.toContain("text-sm text-gray-500");
    });

    it("muestra el deadline formateado si está presente", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ deadline: new Date("2026-06-15") }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Entrega:");
    });

    it("no muestra la sección de deadline si no está presente", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ deadline: undefined }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Entrega:");
    });
  });

  describe("render condicional según entrega", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
      mockGetAssignmentsDeComision.mockResolvedValue([makeAssignment()]);
    });

    it("muestra AcceptButton cuando no hay entrega", async () => {
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
      mockGetAssignmentsDeComision.mockResolvedValue([
        makeAssignment({ id: "assignment-123" }),
      ]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-assignment="assignment-123"');
    });

    it("consulta las entregas usando el username del usuario actual", async () => {
      mockRequireUser.mockResolvedValue(
        makeUser({ githubUsername: "miusuario", rol: DOCENTE })
      );
      mockGetAssignmentsDeComision.mockResolvedValue([makeAssignment({ id: "tp-1" })]);

      await DashboardPage();
      expect(mockGetEntregaDeUsuario).toHaveBeenCalledWith("miusuario");
    });
  });

  describe("assignments grupales", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );
    });

    it("muestra 'Elegir grupo' cuando es grupal y el alumno no tiene grupo", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([makeGrupalAssignment()]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Elegir grupo");
      expect(html).not.toContain("data-testid=\"accept-button\"");
    });

    it("el link 'Elegir grupo' apunta a la página del grupo del assignment", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([makeGrupalAssignment({ id: "tp-g1" })]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("/assignments/tp-g1/grupo");
    });

    it("muestra AcceptButton cuando es grupal y el alumno ya tiene grupo", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      mockGetAssignmentsDeComision.mockResolvedValue([grupalAssignment]);
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-g1", makeGrupo({ nombre: "Los Lambdas" })]])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("data-testid=\"accept-button\"");
      expect(html).not.toContain("Elegir grupo");
    });

    it("muestra el nombre del grupo cuando el alumno ya tiene grupo sin entrega", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      mockGetAssignmentsDeComision.mockResolvedValue([grupalAssignment]);
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-g1", makeGrupo({ nombre: "Los Lambdas" })]])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Los Lambdas");
      expect(html).toContain('href="/assignments/tp-g1/grupo"');
    });

    // (a) issue #138: con entrega del usuario y repo, el link al grupo
    // sigue visible — antes la condición era `grupo && !entrega` y lo
    // ocultaba.
    it("muestra 'Ir al repo' y sigue mostrando el link al grupo, aunque tenga entrega", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      const entrega = makeEntrega({ repoUrl: "https://github.com/pdep/tp-g1" });
      mockGetAssignmentsDeComision.mockResolvedValue([grupalAssignment]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map([["tp-g1", entrega]]));
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-g1", makeGrupo({ nombre: "Los Lambdas" })]])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Ir al repo");
      expect(html).not.toContain("Elegir grupo");
      expect(html).toContain("Los Lambdas");
      expect(html).toContain('href="/assignments/tp-g1/grupo"');
    });

    // (b) issue #138: sin entrega DEL GRUPO (mapa vacío, default del
    // `beforeEach`), se ven nombre completo y @username, pero ningún chip
    // de acceso — todavía no hay repo del que tener o no acceso.
    it("muestra nombre completo y @username de los integrantes, sin chips de acceso, cuando el grupo no tiene entrega", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      const ana = Object.assign(new Alumno(), {
        nombre: "Ana",
        apellido: "García",
        githubUsername: "testuser",
      });
      mockGetAssignmentsDeComision.mockResolvedValue([grupalAssignment]);
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([
          ["tp-g1", makeGrupo({ nombre: "Los Lambdas", miembros: [fakeMiembro("testuser", ana)] })],
        ])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("García, Ana");
      expect(html).toContain("@testuser");
      expect(html).not.toContain("Con acceso al repo");
      expect(html).not.toContain("Sin acceso al repo");
    });

    // (c) issue #138: `getEntregasDeGrupos` trae la entrega DEL GRUPO (no la
    // del usuario) con repo activo — los chips reflejan `githubUsernames`
    // de esa entrega, integrante por integrante.
    it("muestra chips de acceso por integrante cuando la entrega del grupo tiene repo activo", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      const grupo = makeGrupo({
        id: "g1",
        nombre: "Los Lambdas",
        miembros: [fakeMiembro("testuser"), fakeMiembro("bob")],
      });
      const entregaDelGrupo = makeEntrega({
        repoUrl: "https://github.com/pdep/tp-g1",
        githubUsernames: ["testuser"],
      });
      mockGetAssignmentsDeComision.mockResolvedValue([grupalAssignment]);
      mockGetGruposDeAlumno.mockResolvedValue(new Map([["tp-g1", grupo]]));
      mockGetEntregasDeGrupos.mockResolvedValue(new Map([["g1", entregaDelGrupo]]));

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Con acceso al repo");
      expect(html).toContain("Sin acceso al repo");
      expect(mockGetEntregasDeGrupos).toHaveBeenCalledWith({ comisionId: "c1" });
    });

    // (d) issue #123: el usuario se sumó al grupo después de creado el repo
    // y no figura en `githubUsernames` — `getEntregasDeUsuario` no le trae
    // nada propio, pero la tarjeta igual muestra los chips de todos (vía la
    // entrega DEL GRUPO) y las acciones del usuario siguen sin "Ir al repo".
    it("issue #123: sin entrega propia pero con entrega del grupo, muestra los chips igual y no ofrece 'Ir al repo' al usuario", async () => {
      const grupalAssignment = makeGrupalAssignment({ id: "tp-g1" });
      const grupo = makeGrupo({
        id: "g1",
        nombre: "Los Lambdas",
        miembros: [fakeMiembro("testuser"), fakeMiembro("bob")],
      });
      const entregaDelGrupo = makeEntrega({
        repoUrl: "https://github.com/pdep/tp-g1",
        githubUsernames: ["bob"],
      });
      mockGetAssignmentsDeComision.mockResolvedValue([grupalAssignment]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map());
      mockGetGruposDeAlumno.mockResolvedValue(new Map([["tp-g1", grupo]]));
      mockGetEntregasDeGrupos.mockResolvedValue(new Map([["g1", entregaDelGrupo]]));

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Con acceso al repo");
      expect(html).toContain("Sin acceso al repo");
      expect(html).not.toContain("Ir al repo");
      expect(html).toContain("data-testid=\"accept-button\"");
    });

    it("carga los grupos del docente igual que los de un alumno", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
      mockGetAssignmentsDeComision.mockResolvedValue([makeGrupalAssignment()]);

      await DashboardPage();
      expect(mockGetGruposDeAlumno).toHaveBeenCalledWith("testuser");
    });

    it("consulta getEntregasDeGrupos con la comisión activa", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
      mockGetAssignmentsDeComision.mockResolvedValue([makeGrupalAssignment()]);

      await DashboardPage();
      expect(mockGetEntregasDeGrupos).toHaveBeenCalledWith({ comisionId: "c1" });
    });

    it("no consulta getEntregasDeGrupos cuando no hay comisión activa", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
      mockGetComisionActiva.mockResolvedValue(null);

      await DashboardPage();
      expect(mockGetEntregasDeGrupos).not.toHaveBeenCalled();
    });
  });

  describe("ciclo de vida", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ registroConfirmadoEn: { id: "c1" } as any })
      );
    });

    it("muestra un archivado con entrega: badge, link al repo, sin botón de aceptar", async () => {
      const archivado = makeAssignment({ id: "a-archivado" });
      archivado.transicionarA("archivado", { tieneEntregas: true }, "docente1");
      const entrega = makeEntrega({ repoUrl: "https://github.com/pdep/a-archivado" });
      mockGetAssignmentsDeComision.mockResolvedValue([archivado]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map([["a-archivado", entrega]]));

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="estado-badge"');
      expect(html).toContain("Archivado");
      expect(html).toContain("Ir al repo");
      expect(html).not.toContain('data-testid="accept-button"');
      expect(html).not.toContain("Elegir grupo");
    });

    // Revisión del PR #139: la página de grupo exige `permiteAccionesDeAlumno()` y
    // responde 404 en un TP archivado — el link de la tarjeta no debe llevar
    // a ese 404, así que el nombre del grupo va sin link.
    it("muestra el nombre del grupo sin link cuando el TP grupal está archivado", async () => {
      const archivado = makeGrupalAssignment({ id: "tp-archivado" });
      archivado.transicionarA("archivado", { tieneEntregas: true }, "docente1");
      const entrega = makeEntrega({ repoUrl: "https://github.com/pdep/tp-archivado" });
      mockGetAssignmentsDeComision.mockResolvedValue([archivado]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map([["tp-archivado", entrega]]));
      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-archivado", makeGrupo({ nombre: "Los Lambdas" })]])
      );

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Los Lambdas");
      expect(html).not.toContain('href="/assignments/tp-archivado/grupo"');
    });

    it("informa una provisión fallida archivada sin ofrecer reintento", async () => {
      const archivado = makeAssignment({ id: "a-archivado" });
      archivado.transicionarA("archivado", { tieneEntregas: true }, "docente1");
      const entrega = makeEntrega({ provisionEstado: "fallida", repoUrl: undefined });
      mockGetAssignmentsDeComision.mockResolvedValue([archivado]);
      mockGetEntregaDeUsuario.mockResolvedValue(new Map([["a-archivado", entrega]]));

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No se pudo crear el repo antes de archivar el TP");
      expect(html).not.toContain("Podés reintentar");
      expect(html).not.toContain('data-testid="accept-button"');
    });

    it("no muestra un archivado sin entrega", async () => {
      const archivado = makeAssignment({ id: "a-archivado", titulo: "TP Archivado" });
      archivado.transicionarA("archivado", { tieneEntregas: false }, "docente1");
      mockGetAssignmentsDeComision.mockResolvedValue([archivado]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("TP Archivado");
    });

    it("no muestra un assignment en borrador", async () => {
      const borrador = makeAssignment({ id: "a-borrador", titulo: "TP Borrador" });
      borrador.estadoNombre = "borrador";
      mockGetAssignmentsDeComision.mockResolvedValue([borrador]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("TP Borrador");
    });

    it("no muestra badge para assignments publicados", async () => {
      const publicado = makeAssignment({ id: "a-publicado" });
      mockGetAssignmentsDeComision.mockResolvedValue([publicado]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain('data-testid="estado-badge"');
    });

    // issue #107/#112: reemplaza al viejo "el admin ve assignments en
    // cualquier estado, incluido borrador" — Mis TPs del docente es ahora la
    // vista del alumno de la comisión activa, así que nunca ve un borrador.
    it("el docente no ve un assignment en borrador (mismas reglas que un alumno)", async () => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
      const borrador = makeAssignment({ id: "a-borrador", titulo: "TP Borrador Docente" });
      borrador.estadoNombre = "borrador";
      mockGetAssignmentsDeComision.mockResolvedValue([borrador]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("TP Borrador Docente");
    });
  });

  describe("header", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(
        makeUser({ githubUsername: "miusuario", rol: DOCENTE })
      );
      mockGetAssignmentsDeComision.mockResolvedValue([]);
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

  // issue #107/#112: Mis TPs para el docente es la vista del alumno de la
  // comisión activa — mismos assignments, mismas reglas de estado, sin
  // registro ni aviso (el aviso y el bypass administrativo se retiraron).
  describe("docente en Mis TPs", () => {
    beforeEach(() => {
      mockRequireUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    });

    it("sin registro no redirige a /registro", async () => {
      mockGetAlumnoByGithub.mockResolvedValue(null);

      const element = await DashboardPage();
      expect(element).toBeDefined();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
    });

    it("ve sólo publicados de la comisión activa (no borradores)", async () => {
      const publicado = makeAssignment({ id: "a-publicado", titulo: "TP Publicado" });
      const borrador = makeAssignment({ id: "a-borrador", titulo: "TP Borrador" });
      borrador.estadoNombre = "borrador";
      mockGetAssignmentsDeComision.mockResolvedValue([publicado, borrador]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("TP Publicado");
      expect(html).not.toContain("TP Borrador");
      expect(mockGetAssignmentsDeComision).toHaveBeenCalledWith("c1");
    });

    it("sin comisión activa ve una lista vacía", async () => {
      mockGetComisionActiva.mockResolvedValue(null);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay assignments publicados todavía");
      expect(mockGetAssignmentsDeComision).not.toHaveBeenCalled();
    });

    it("acepta un individual sin haberse registrado como alumno", async () => {
      mockGetAssignmentsDeComision.mockResolvedValue([makeAssignment()]);

      const element = await DashboardPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="accept-button"');
    });

    it("registrado sin grupo ve 'Elegir grupo' en un grupal; con grupo ve Aceptar", async () => {
      const grupal = makeGrupalAssignment({ id: "tp-g1" });
      mockGetAssignmentsDeComision.mockResolvedValue([grupal]);

      const sinGrupo = await DashboardPage();
      const htmlSinGrupo = renderToStaticMarkup(sinGrupo);
      expect(htmlSinGrupo).toContain("Elegir grupo");

      mockGetGruposDeAlumno.mockResolvedValue(
        new Map([["tp-g1", makeGrupo({ nombre: "Los Lambdas" })]])
      );
      const conGrupo = await DashboardPage();
      const htmlConGrupo = renderToStaticMarkup(conGrupo);
      expect(htmlConGrupo).toContain('data-testid="accept-button"');
      expect(htmlConGrupo).not.toContain("Elegir grupo");
    });
  });
});
