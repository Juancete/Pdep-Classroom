import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Collection } from "@mikro-orm/core";
import {
  IndividualAssignment,
  GrupalAssignment,
  Entrega,
  Alumno,
  Grupo,
  MiembroDeGrupo,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockGetEntregas = vi.fn();
const mockGetAlumnos = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
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
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

vi.mock("../grupos-panel", () => ({
  GruposPanel: ({
    assignmentId,
    grupos,
    alumnosSinGrupo,
  }: {
    assignmentId: string;
    grupos: {
      id: string;
      tipoDeIntegrantes: string;
      destinos: { id: string; conEntrega: boolean }[];
      entrega?: { estadoRepo: string; ci?: { resultadoNombre: string }; ultimoPush?: { por: string } };
    }[];
    alumnosSinGrupo: { username: string }[];
  }) => (
    <div
      data-testid="grupos-panel"
      data-assignment={assignmentId}
      data-grupos={grupos.length}
      data-sin-grupo={alumnosSinGrupo.length}
      data-grupos-con-entrega={grupos.filter((grupo) => grupo.entrega).map((grupo) => grupo.id).join(",")}
      data-ci={grupos.map((grupo) => grupo.entrega?.ci?.resultadoNombre ?? "-").join(",")}
      data-ultimo-push={grupos.map((grupo) => grupo.entrega?.ultimoPush?.por ?? "-").join(",")}
      data-destinos={grupos.map((grupo) => `${grupo.id}:${grupo.destinos.map((destino) => `${destino.id}${destino.conEntrega ? "*" : ""}`).join("+")}`).join(",")}
      data-grupos-docentes={grupos.filter((grupo) => grupo.tipoDeIntegrantes === "docentes").map((grupo) => grupo.id).join(",")}
    />
  ),
}));

vi.mock("../volcar-grupos-button", () => ({
  VolcarGruposButton: ({
    assignmentId,
    columna,
  }: {
    assignmentId: string;
    columna: number;
  }) => (
    <div
      data-testid="volcar-grupos-button"
      data-assignment={assignmentId}
      data-columna={columna}
    />
  ),
}));

import GruposAssignmentPage from "./page";

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
  grupo.nombreNormalizado = "grupo-1";
  grupo.paradigma = "objetos";
  grupo.maxIntegrantes = 3;
  grupo.creadoPor = "usuario1";
  grupo.assignment = makeGrupalAssignment({ id: "a2" });
  const miembrosItems: MiembroDeGrupo[] = [];
  grupo.miembros = {
    getItems: () => miembrosItems,
    get length() {
      return miembrosItems.length;
    },
  } as unknown as Collection<MiembroDeGrupo>;
  return Object.assign(grupo, overrides);
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Assignment Grupos Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetEntregas.mockResolvedValue([]);
    mockGetAlumnos.mockResolvedValue([]);
    mockGetGruposDeAssignment.mockResolvedValue([]);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
    await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/assignments si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);
    await expect(
      GruposAssignmentPage({ params: Promise.resolve({ id: "no-existe" }) })
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("redirige al detalle si el assignment no es grupal", async () => {
    mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
    await expect(
      GruposAssignmentPage({ params: Promise.resolve({ id: "a1" }) })
    ).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments/a1");
  });

  it("marca la pestaña Grupos como activa", async () => {
    mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
    const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
    expect(renderToStaticMarkup(element)).toMatch(/aria-current="page"[^>]*>Grupos</);
  });

  describe("panel de grupos (assignments grupales)", () => {
    it("muestra GruposPanel para assignments grupales", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-testid="grupos-panel"');
    });

    it("pasa los grupos al panel", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetGruposDeAssignment.mockResolvedValue([
        makeGrupo({ id: "g1" }),
        makeGrupo({ id: "g2" }),
      ]);
      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-grupos="2"');
    });

    it("calcula correctamente los alumnos sin grupo", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ id: "al1", githubUsername: "usuario1" }),
        makeAlumno({ id: "al2", githubUsername: "usuario2" }),
        makeAlumno({ id: "al3", githubUsername: "usuario3" }),
      ]);
      const grupoConMiembro = makeGrupo({ id: "g1" });
      const miembro = Object.assign(new MiembroDeGrupo(), { githubUsername: "usuario1" });
      grupoConMiembro.miembros = {
        getItems: () => [miembro],
        get length() {
          return 1;
        },
      } as unknown as Collection<MiembroDeGrupo>;
      mockGetGruposDeAssignment.mockResolvedValue([grupoConMiembro]);

      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-sin-grupo="2"');
    });

    it("no llama a getGruposDeAssignment para assignments individuales", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      await expect(
        GruposAssignmentPage({ params: Promise.resolve({ id: "a1" }) })
      ).rejects.toThrow("redirect");
      expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
    });

    it("arma el resumen con entrega sólo para el grupo con una entrega registrada, reusando getEntregas sin queries extra", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetGruposDeAssignment.mockResolvedValue([
        makeGrupo({ id: "g1" }),
        makeGrupo({ id: "g2" }),
      ]);
      mockGetEntregas.mockResolvedValue([
        makeEntrega({ grupo: makeGrupo({ id: "g1" }) }),
      ]);

      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });

      expect(renderToStaticMarkup(element)).toContain('data-grupos-con-entrega="g1"');
    });

    it("la entrega del grupo llega al resumen con CI y último push", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetGruposDeAssignment.mockResolvedValue([makeGrupo({ id: "g1" }), makeGrupo({ id: "g2" })]);
      mockGetEntregas.mockResolvedValue([
        makeEntrega({
          grupo: makeGrupo({ id: "g1" }),
          ciResultadoNombre: "passing",
          ultimoPushEn: new Date("2026-03-15T12:00:00Z"),
          ultimoPushPor: "ana",
        }),
      ]);

      const markup = renderToStaticMarkup(
        await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) })
      );

      expect(markup).toContain('data-ci="passing,-"');
      expect(markup).toContain('data-ultimo-push="ana,-"');
    });

    it("los destinos de cada grupo son los otros del TP e indican cuáles ya tienen entrega", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetGruposDeAssignment.mockResolvedValue([makeGrupo({ id: "g1" }), makeGrupo({ id: "g2" })]);
      mockGetEntregas.mockResolvedValue([makeEntrega({ grupo: makeGrupo({ id: "g2" }) })]);

      const markup = renderToStaticMarkup(
        await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) })
      );

      expect(markup).toContain('data-destinos="g1:g2*,g2:g1"');
    });

    // issue #107: la serialización a GrupoAdminResumen propaga
    // `tipoDeIntegrantes` — sin esto el panel no puede distinguir un grupo
    // de docentes al filtrar destinos de "Mover a…"/"Agregar a…".
    it("propaga tipoDeIntegrantes en la serialización de cada grupo", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetGruposDeAssignment.mockResolvedValue([
        makeGrupo({ id: "g1", tipoDeIntegrantes: "alumnos" }),
        makeGrupo({ id: "g2", tipoDeIntegrantes: "docentes" }),
      ]);

      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });

      expect(renderToStaticMarkup(element)).toContain('data-grupos-docentes="g2"');
    });
  });

  // Issue #109
  describe("botón de volcar grupos a la planilla", () => {
    it("no lo muestra para un grupal sin columna configurada", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).not.toContain("volcar-grupos-button");
    });

    it("lo muestra para un grupal con columna configurada, pasando assignmentId y columna", async () => {
      mockGetAssignment.mockResolvedValue(
        makeGrupalAssignment({ id: "a2", columnaGrupoEnPlanilla: 5 })
      );
      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-testid="volcar-grupos-button"');
      expect(markup).toContain('data-assignment="a2"');
      expect(markup).toContain('data-columna="5"');
    });

    it("lo muestra aunque la columna configurada sea 0 (columna A)", async () => {
      mockGetAssignment.mockResolvedValue(
        makeGrupalAssignment({ id: "a2", columnaGrupoEnPlanilla: 0 })
      );
      const element = await GruposAssignmentPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-columna="0"');
    });
  });
});
