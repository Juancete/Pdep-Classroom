import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndividualAssignment, GrupalAssignment } from "@/domain/entities";
import { Entrega } from "@/domain/entities";
import { Alumno } from "@/domain/entities";
import { Grupo } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetEntregas = vi.fn();
const mockGetAlumnos = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getEntregas: (id: string) => mockGetEntregas(id),
  getAlumnos: () => mockGetAlumnos(),
  getGruposDeAssignment: (id: string) => mockGetGruposDeAssignment(id),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("redirect");
  },
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("./entregas-table", () => ({
  EntregasTable: ({ entregas }: { entregas: { id: string }[] }) => (
    <div data-testid="entregas-table" data-count={entregas.length} />
  ),
}));

vi.mock("../delete-repos-button", () => ({
  DeleteReposButton: ({ activeRepoCount }: { activeRepoCount: number }) => (
    <button data-testid="delete-repos-button" data-count={activeRepoCount} />
  ),
}));

vi.mock("./grupos-panel", () => ({
  GruposPanel: ({
    assignmentId,
    inscripcionesCerradas,
    grupos,
    alumnosSinGrupo,
  }: {
    assignmentId: string;
    inscripcionesCerradas: boolean;
    grupos: { id: string }[];
    alumnosSinGrupo: { username: string }[];
  }) => (
    <div
      data-testid="grupos-panel"
      data-assignment={assignmentId}
      data-cerradas={String(inscripcionesCerradas)}
      data-grupos={grupos.length}
      data-sin-grupo={alumnosSinGrupo.length}
    />
  ),
}));

import AssignmentDetailPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeIndividualAssignment(
  overrides?: Partial<IndividualAssignment>
): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.titulo = "Kata Funcional";
  assignment.descripcion = "Descripción de la kata";
  assignment.templateRepo = "kata-template";
  assignment.tipo = "individual";
  assignment.paradigma = "funcional";
  assignment.slug = "kata-funcional";
  assignment.createdAt = new Date("2026-01-01");
  return Object.assign(assignment, overrides);
}

function makeGrupalAssignment(
  overrides?: Partial<GrupalAssignment>
): GrupalAssignment {
  const assignment = new GrupalAssignment();
  assignment.id = "a2";
  assignment.titulo = "TP Objetos";
  assignment.descripcion = "Trabajo práctico grupal";
  assignment.templateRepo = "tp-objetos-template";
  assignment.tipo = "grupal";
  assignment.paradigma = "objetos";
  assignment.slug = "tp-objetos";
  assignment.createdAt = new Date("2026-01-01");
  assignment.maxIntegrantes = 3;
  return Object.assign(assignment, overrides);
}

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const entrega = new Entrega();
  entrega.id = "e1";
  entrega.githubUsernames = ["usuario1"];
  entrega.repoName = "kata-funcional-usuario1";
  entrega.repoUrl = "https://github.com/org/kata-funcional-usuario1";
  entrega.createdAt = new Date("2026-01-02");
  return Object.assign(entrega, overrides);
}

function makeAlumno(overrides?: Partial<Alumno>): Alumno {
  const alumno = new Alumno();
  alumno.id = "al1";
  alumno.legajo = "12345";
  alumno.nombre = "Juan";
  alumno.apellido = "García";
  alumno.githubUsername = "usuario1";
  alumno.email = "juan@test.com";
  return Object.assign(alumno, overrides);
}

function makeGrupo(overrides?: Partial<Grupo>): Grupo {
  const grupo = new Grupo();
  grupo.id = "g1";
  grupo.nombre = "Grupo 1";
  grupo.paradigma = "objetos";
  grupo.maxIntegrantes = 3;
  grupo.creadoPor = "usuario1";
  const miembros: string[] = [];
  const fakeMethods = {
    isOpen: () => true,
    estaLleno: () => false,
    etiquetaCupo: () => `${miembros.length}/${grupo.maxIntegrantes} integrantes`,
    usernamesDeMiembros: () => miembros,
    usernamesCanonicos: () => miembros.map((username) => username.toLowerCase()),
    alumnos: {
      getItems: () => [] as ReturnType<typeof makeAlumno>[],
    },
  };
  return Object.assign(grupo, fakeMethods, overrides);
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Assignment Detail Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetEntregas.mockResolvedValue([]);
    mockGetAlumnos.mockResolvedValue([]);
    mockGetGruposDeAssignment.mockResolvedValue([]);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/assignments si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    await expect(
      AssignmentDetailPage({ params: Promise.resolve({ id: "no-existe" }) })
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("consulta el assignment con el id correcto", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ id: "tp-logico" }));
    await AssignmentDetailPage({ params: Promise.resolve({ id: "tp-logico" }) });
    expect(mockGetAssignment).toHaveBeenCalledWith("tp-logico");
  });

  describe("contenido del assignment", () => {
    it("muestra el título del assignment", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ titulo: "TP Lógico" }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain("TP Lógico");
    });

    it("muestra el paradigma del assignment", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ paradigma: "logico" }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain("logico");
    });

    it("muestra el tipo del assignment", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ tipo: "individual" }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain("individual");
    });

    it("muestra el templateRepo", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ templateRepo: "mi-template" }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain("mi-template");
    });

    it("muestra la descripción cuando está presente", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ descripcion: "Una descripción muy detallada" })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain("Una descripción muy detallada");
    });

    it("no muestra la descripción cuando no está presente", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ descripcion: undefined }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).not.toContain("Una descripción");
    });

    it("muestra el deadline cuando está presente", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ deadline: new Date("2026-06-30") })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Deadline");
      expect(html).toContain("2026");
    });

    it("no muestra el deadline cuando no está presente", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ deadline: undefined }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).not.toContain("Deadline");
    });

    it("muestra el link de volver", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain('href="/admin/assignments"');
    });

    it("muestra el link de editar", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ id: "a1" }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain('href="/admin/assignments/a1/edit"');
    });
  });

  describe("queries al repositorio", () => {
    it("siempre consulta alumnos (para nombres y conteo individual)", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(mockGetAlumnos).toHaveBeenCalledOnce();
      expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
    });

    it("consulta alumnos y grupos del assignment para el tipo grupal", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(mockGetAlumnos).toHaveBeenCalledOnce();
      expect(mockGetGruposDeAssignment).toHaveBeenCalledWith("a2");
    });
  });

  describe("contadores", () => {
    it('muestra "Alumnos" como etiqueta del total para individual', async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain("Alumnos");
    });

    it('muestra "Grupos" como etiqueta del total para grupal', async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment());
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain("Grupos");
    });

    it("muestra la cantidad correcta de entregas aceptadas", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([
        makeEntrega({ id: "e1" }),
        makeEntrega({ id: "e2", githubUsernames: ["usuario2"] }),
      ]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain(">2<");
    });

    it("calcula correctamente los pendientes para individual", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega()]);
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ id: "al1" }),
        makeAlumno({ id: "al2", githubUsername: "usuario2" }),
        makeAlumno({ id: "al3", githubUsername: "usuario3" }),
      ]);
      // 3 alumnos - 1 entrega = 2 pendientes
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain(">2<");
    });

    it("calcula correctamente los pendientes para grupal", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega()]);
      mockGetGruposDeAssignment.mockResolvedValue([
        makeGrupo({ id: "g1" }),
        makeGrupo({ id: "g2" }),
        makeGrupo({ id: "g3" }),
        makeGrupo({ id: "g4" }),
      ]);
      // 4 grupos - 1 entrega = 3 pendientes
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain(">3<");
    });

    it("no muestra pendientes negativos", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega(), makeEntrega({ id: "e2" })]);
      mockGetAlumnos.mockResolvedValue([makeAlumno()]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain(">0<");
    });
  });

  describe("datos pasados a EntregasTable", () => {
    it("pasa la cantidad correcta de entregas", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([
        makeEntrega({ id: "e1" }),
        makeEntrega({ id: "e2", githubUsernames: ["usuario2"] }),
        makeEntrega({ id: "e3", githubUsernames: ["usuario3"] }),
      ]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain('data-count="3"');
    });

    it("construye el nombreCompleto con apellido, nombre del alumno registrado", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega({ githubUsernames: ["usuario1"] })]);
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ githubUsername: "usuario1", apellido: "García", nombre: "Juan" }),
      ]);
      await expect(
        AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) })
      ).resolves.toBeDefined();
    });
  });

  describe("panel de grupos (assignments grupales)", () => {
    it("no muestra GruposPanel para assignments individuales", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).not.toContain("grupos-panel");
    });

    it("muestra GruposPanel para assignments grupales", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-testid="grupos-panel"');
    });

    it("pasa inscripcionesCerradas=true cuando el assignment las tiene cerradas", async () => {
      mockGetAssignment.mockResolvedValue(
        makeGrupalAssignment({ id: "a2", inscripcionesCerradas: true })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-cerradas="true"');
    });

    it("pasa inscripcionesCerradas=false cuando están abiertas", async () => {
      mockGetAssignment.mockResolvedValue(
        makeGrupalAssignment({ id: "a2", inscripcionesCerradas: false })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-cerradas="false"');
    });

    it("pasa los grupos al panel", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetGruposDeAssignment.mockResolvedValue([
        makeGrupo({ id: "g1" }),
        makeGrupo({ id: "g2" }),
      ]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-grupos="2"');
    });

    it("calcula correctamente los alumnos sin grupo", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ id: "al1", githubUsername: "usuario1" }),
        makeAlumno({ id: "al2", githubUsername: "usuario2" }),
        makeAlumno({ id: "al3", githubUsername: "usuario3" }),
      ]);
      const miembros = ["usuario1"];
      const grupoConMiembro = {
        id: "g1",
        nombre: "Grupo 1",
        paradigma: "objetos",
        maxIntegrantes: 3,
        creadoPor: "usuario1",
        isOpen: () => true,
        estaLleno: () => false,
        etiquetaCupo: () => `${miembros.length}/3 integrantes`,
        usernamesDeMiembros: () => miembros,
        usernamesCanonicos: () => miembros.map((username) => username.toLowerCase()),
        alumnos: {
          getItems: () => miembros.map((username) => makeAlumno({ githubUsername: username })),
        },
      };
      mockGetGruposDeAssignment.mockResolvedValue([grupoConMiembro]);

      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-sin-grupo="2"');
    });

    it("no llama a getGruposDeAssignment para assignments individuales", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
    });
  });
});
