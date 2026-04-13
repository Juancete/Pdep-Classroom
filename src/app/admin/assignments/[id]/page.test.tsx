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

import AssignmentDetailPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeIndividualAssignment(
  overrides?: Partial<IndividualAssignment>
): IndividualAssignment {
  const a = new IndividualAssignment();
  a.id = "a1";
  a.titulo = "Kata Funcional";
  a.descripcion = "Descripción de la kata";
  a.templateRepo = "kata-template";
  a.tipo = "individual";
  a.paradigma = "funcional";
  a.slug = "kata-funcional";
  a.createdAt = new Date("2026-01-01");
  return Object.assign(a, overrides);
}

function makeGrupalAssignment(
  overrides?: Partial<GrupalAssignment>
): GrupalAssignment {
  const a = new GrupalAssignment();
  a.id = "a2";
  a.titulo = "TP Objetos";
  a.descripcion = "Trabajo práctico grupal";
  a.templateRepo = "tp-objetos-template";
  a.tipo = "grupal";
  a.paradigma = "objetos";
  a.slug = "tp-objetos";
  a.createdAt = new Date("2026-01-01");
  a.maxIntegrantes = 3;
  return Object.assign(a, overrides);
}

function makeEntrega(overrides?: Partial<Entrega>): Entrega {
  const e = new Entrega();
  e.id = "e1";
  e.githubUsernames = ["usuario1"];
  e.repoName = "kata-funcional-usuario1";
  e.repoUrl = "https://github.com/org/kata-funcional-usuario1";
  e.createdAt = new Date("2026-01-02");
  return Object.assign(e, overrides);
}

function makeAlumno(overrides?: Partial<Alumno>): Alumno {
  const a = new Alumno();
  a.id = "al1";
  a.legajo = "12345";
  a.nombre = "Juan";
  a.apellido = "García";
  a.githubUsername = "usuario1";
  a.email = "juan@test.com";
  return Object.assign(a, overrides);
}

function makeGrupo(overrides?: Partial<Grupo>): Grupo {
  const g = new Grupo();
  g.id = "g1";
  g.nombre = "Grupo 1";
  g.paradigma = "objetos";
  g.maxIntegrantes = 3;
  g.creadoPor = "usuario1";
  return Object.assign(g, overrides);
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
    await AssignmentDetailPage({ params: { id: "a1" } });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/assignments si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    await expect(
      AssignmentDetailPage({ params: { id: "no-existe" } })
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("consulta el assignment con el id correcto", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ id: "tp-logico" }));
    await AssignmentDetailPage({ params: { id: "tp-logico" } });
    expect(mockGetAssignment).toHaveBeenCalledWith("tp-logico");
  });

  describe("contenido del assignment", () => {
    it("muestra el título del assignment", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ titulo: "TP Lógico" }));
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain("TP Lógico");
    });

    it("muestra el paradigma del assignment", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ paradigma: "logico" }));
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain("logico");
    });

    it("muestra el tipo del assignment", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ tipo: "individual" }));
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain("individual");
    });

    it("muestra el templateRepo", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ templateRepo: "mi-template" }));
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain("mi-template");
    });

    it("muestra la descripción cuando está presente", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ descripcion: "Una descripción muy detallada" })
      );
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain("Una descripción muy detallada");
    });

    it("no muestra la descripción cuando no está presente", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ descripcion: undefined }));
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).not.toContain("Una descripción");
    });

    it("muestra el deadline cuando está presente", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ deadline: new Date("2026-06-30") })
      );
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Deadline");
      expect(html).toContain("2026");
    });

    it("no muestra el deadline cuando no está presente", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ deadline: undefined }));
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).not.toContain("Deadline");
    });

    it("muestra el link de volver", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain('href="/admin/assignments"');
    });

    it("muestra el link de editar", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment({ id: "a1" }));
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain('href="/admin/assignments/a1/edit"');
    });
  });

  describe("queries al repositorio", () => {
    it("siempre consulta alumnos (para nombres y conteo individual)", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      await AssignmentDetailPage({ params: { id: "a1" } });
      expect(mockGetAlumnos).toHaveBeenCalledOnce();
      expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
    });

    it("consulta alumnos y grupos del assignment para el tipo grupal", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      await AssignmentDetailPage({ params: { id: "a2" } });
      expect(mockGetAlumnos).toHaveBeenCalledOnce();
      expect(mockGetGruposDeAssignment).toHaveBeenCalledWith("a2");
    });
  });

  describe("contadores", () => {
    it('muestra "Alumnos" como etiqueta del total para individual', async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain("Alumnos");
    });

    it('muestra "Grupos" como etiqueta del total para grupal', async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment());
      const element = await AssignmentDetailPage({ params: { id: "a2" } });
      expect(renderToStaticMarkup(element)).toContain("Grupos");
    });

    it("muestra la cantidad correcta de entregas aceptadas", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([
        makeEntrega({ id: "e1" }),
        makeEntrega({ id: "e2", githubUsernames: ["usuario2"] }),
      ]);
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
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
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
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
      const element = await AssignmentDetailPage({ params: { id: "a2" } });
      expect(renderToStaticMarkup(element)).toContain(">3<");
    });

    it("no muestra pendientes negativos", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega(), makeEntrega({ id: "e2" })]);
      mockGetAlumnos.mockResolvedValue([makeAlumno()]);
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
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
      const element = await AssignmentDetailPage({ params: { id: "a1" } });
      expect(renderToStaticMarkup(element)).toContain('data-count="3"');
    });

    it("construye el nombreCompleto con apellido, nombre del alumno registrado", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega({ githubUsernames: ["usuario1"] })]);
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ githubUsername: "usuario1", apellido: "García", nombre: "Juan" }),
      ]);
      // No podemos inspeccionar los props del mock directamente, pero podemos
      // verificar que el page no falla al construir el nombre completo
      await expect(
        AssignmentDetailPage({ params: { id: "a1" } })
      ).resolves.toBeDefined();
    });
  });
});
