import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IndividualAssignment, GrupalAssignment, Comision } from "@/domain/entities";
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

vi.mock("./entregas-table", () => ({
  EntregasTable: ({
    entregas,
    mostrarGrupo,
  }: {
    entregas: {
      id: string;
      grupoNombre?: string;
      integrantes: {
        username: string;
        nombreCompleto: string;
        participacion?: { commits: number; porcentaje: number };
      }[];
      participacion?: { totalCommits: number };
    }[];
    mostrarGrupo: boolean;
  }) => (
    <div
      data-testid="entregas-table"
      data-count={entregas.length}
      data-mostrar-grupo={String(mostrarGrupo)}
      data-grupos-nombres={entregas.map((entrega) => entrega.grupoNombre ?? "").join(",")}
      data-integrantes={JSON.stringify(entregas.map((entrega) => entrega.integrantes))}
      data-participacion={JSON.stringify(entregas.map((entrega) => entrega.participacion ?? null))}
    />
  ),
}));

vi.mock("../estado-panel", () => ({
  EstadoPanel: ({
    assignmentId,
    estado,
    acciones,
    inscripciones,
  }: {
    assignmentId: string;
    estado: string;
    acciones: { destino: string; motivoDeBloqueo: string | null }[];
    inscripciones?: { cerradas: boolean };
  }) => (
    <div
      data-testid="estado-panel"
      data-assignment={assignmentId}
      data-estado={estado}
      data-acciones={acciones.map((accion) => accion.destino).join(",")}
      data-motivo={
        acciones.find((accion) => accion.destino === "borrador")?.motivoDeBloqueo ?? ""
      }
      data-inscripciones={inscripciones ? String(inscripciones.cerradas) : "ausente"}
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
  grupo.nombreNormalizado = "grupo-1";
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

    // issue #114: la barra de comisión consultada vive sólo en las tres
    // listas (grupos/assignments/alumnos), nunca en el detalle — antes vivía
    // en un layout de /admin/* y aparecía acá también, confundiendo qué
    // comisión aplica a las acciones de esta pantalla.
    it("no muestra la barra de comisión consultada (regresión issue #114)", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).not.toContain("Viendo:");
    });

    it("muestra el año y Histórica cuando el TP pertenece a una comisión no activa", async () => {
      const comisionHistorica = new Comision(2025, "sheet-old");
      comisionHistorica.activa = false;
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ comision: comisionHistorica })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("2025");
      expect(html).toContain("Histórica");
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
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ estadoNombre: "publicado" })
      );
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
      mockGetAssignment.mockResolvedValue(
        makeGrupalAssignment({ estadoNombre: "publicado" })
      );
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
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ estadoNombre: "publicado" })
      );
      mockGetEntregas.mockResolvedValue([makeEntrega(), makeEntrega({ id: "e2" })]);
      mockGetAlumnos.mockResolvedValue([makeAlumno()]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain(">0<");
    });

    it("oculta Pendientes cuando el assignment está en borrador", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).not.toContain("Pendientes");
    });

    it("muestra Pendientes cuando el assignment está publicado", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ estadoNombre: "publicado" })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain("Pendientes");
    });
  });

  describe("ciclo de vida", () => {
    it("muestra el badge con el estado del assignment", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ estadoNombre: "archivado" })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-testid="estado-badge"');
      expect(markup).toContain("Archivado");
    });

    it("pasa las acciones disponibles al panel de estado", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega()]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-estado="borrador"');
      expect(markup).toContain('data-acciones="publicado,archivado"');
    });

    // Fase 3 de la auditoría de dominio: antes el panel inferí­a el motivo por
    // ausencia de la acción "borrador" en la lista; ahora el server page lo
    // calcula con `EstadoAssignment.motivoDeBloqueo` y se lo pasa como prop.
    it("pasa el motivo de bloqueo calculado con motivoDeBloqueo cuando hay entregas", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ estadoNombre: "publicado" })
      );
      mockGetEntregas.mockResolvedValue([makeEntrega()]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain(
        'data-motivo="No se puede pasar de &quot;publicado&quot; a &quot;borrador&quot;: tiene entregas — archivalo en vez de despublicarlo"'
      );
    });

    it("no pasa motivo de bloqueo cuando volver a borrador está permitido", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-motivo=""');
    });

    it("ofrece volver a borrador (bloqueado) y archivar cuando el publicado ya tiene entregas", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ estadoNombre: "publicado" })
      );
      mockGetEntregas.mockResolvedValue([makeEntrega()]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-acciones="borrador,archivado"');
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

    it("resuelve el nombreCompleto de cada integrante por username", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega({ githubUsernames: ["usuario1"] })]);
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ githubUsername: "usuario1", apellido: "García", nombre: "Juan" }),
      ]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      const integrantesEsperados = JSON.stringify([
        [{ username: "usuario1", nombreCompleto: "García, Juan" }],
      ]).replace(/"/g, "&quot;");
      expect(markup).toContain(`data-integrantes="${integrantesEsperados}"`);
    });

    it("usa '—' como nombreCompleto cuando el username no tiene alumno registrado", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega({ githubUsernames: ["usuarioDesconocido"] })]);
      mockGetAlumnos.mockResolvedValue([]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      const integrantesEsperados = JSON.stringify([
        [{ username: "usuarioDesconocido", nombreCompleto: "—" }],
      ]).replace(/"/g, "&quot;");
      expect(markup).toContain(`data-integrantes="${integrantesEsperados}"`);
    });

    // Issue #122: participación por integrante, sólo si ya se sincronizó.
    it("una entrega sincronizada produce porcentajes de participación por githubUsernames", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([
        makeEntrega({
          githubUsernames: ["ana", "bob"],
          contribuciones: [
            { login: "ana", commits: 6 },
            { login: "bob", commits: 4 },
          ],
          contribucionesActualizadoEn: new Date("2026-09-22T10:00:00Z"),
        }),
      ]);
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ githubUsername: "ana", apellido: "García", nombre: "Ana" }),
        makeAlumno({ githubUsername: "bob", apellido: "Pérez", nombre: "Bob" }),
      ]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      const participacionEsperada = JSON.stringify([{ totalCommits: 10 }]).replace(/"/g, "&quot;");
      expect(markup).toContain(`data-participacion="${participacionEsperada}"`);
      const integrantesEsperados = JSON.stringify([
        [
          {
            username: "ana",
            nombreCompleto: "García, Ana",
            participacion: { commits: 6, porcentaje: 60 },
          },
          {
            username: "bob",
            nombreCompleto: "Pérez, Bob",
            participacion: { commits: 4, porcentaje: 40 },
          },
        ],
      ]).replace(/"/g, "&quot;");
      expect(markup).toContain(`data-integrantes="${integrantesEsperados}"`);
    });

    it("una entrega sin sincronizar no trae participación", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([
        makeEntrega({
          githubUsernames: ["usuario1"],
          contribuciones: undefined,
          contribucionesActualizadoEn: undefined,
        }),
      ]);
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ githubUsername: "usuario1", apellido: "García", nombre: "Juan" }),
      ]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain(`data-participacion="${JSON.stringify([null]).replace(/"/g, "&quot;")}"`);
      const integrantesEsperados = JSON.stringify([
        [{ username: "usuario1", nombreCompleto: "García, Juan" }],
      ]).replace(/"/g, "&quot;");
      expect(markup).toContain(`data-integrantes="${integrantesEsperados}"`);
    });
  });

  describe("columna Grupo de EntregasTable", () => {
    it("serializa grupoNombre de cada entrega y activa mostrarGrupo en un TP grupal", async () => {
      mockGetAssignment.mockResolvedValue(makeGrupalAssignment({ id: "a2" }));
      mockGetEntregas.mockResolvedValue([
        makeEntrega({ id: "e1", grupo: makeGrupo({ nombre: "Los Pibes" }) }),
        makeEntrega({ id: "e2" }),
      ]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-mostrar-grupo="true"');
      expect(markup).toContain('data-grupos-nombres="Los Pibes,"');
    });

    it("no activa mostrarGrupo en un TP individual", async () => {
      mockGetAssignment.mockResolvedValue(makeIndividualAssignment());
      mockGetEntregas.mockResolvedValue([makeEntrega()]);
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain('data-mostrar-grupo="false"');
    });
  });

  describe("inscripciones en el panel de estado", () => {
    it("pasa cerradas=true al panel cuando el grupal publicado las tiene cerradas", async () => {
      mockGetAssignment.mockResolvedValue(
        makeGrupalAssignment({
          id: "a2",
          estadoNombre: "publicado",
          inscripcionesCerradas: true,
        })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-inscripciones="true"');
    });

    it("pasa cerradas=false al panel cuando están abiertas", async () => {
      mockGetAssignment.mockResolvedValue(
        makeGrupalAssignment({
          id: "a2",
          estadoNombre: "publicado",
          inscripcionesCerradas: false,
        })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
      expect(renderToStaticMarkup(element)).toContain('data-inscripciones="false"');
    });

    it("no pasa inscripciones para un assignment individual publicado", async () => {
      mockGetAssignment.mockResolvedValue(
        makeIndividualAssignment({ estadoNombre: "publicado" })
      );
      const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a1" }) });
      expect(renderToStaticMarkup(element)).toContain('data-inscripciones="ausente"');
    });

    it.each(["borrador", "archivado"] as const)(
      "no pasa inscripciones para un grupal en %s",
      async (estadoNombre) => {
        mockGetAssignment.mockResolvedValue(
          makeGrupalAssignment({ id: "a2", estadoNombre })
        );
        const element = await AssignmentDetailPage({ params: Promise.resolve({ id: "a2" }) });
        expect(renderToStaticMarkup(element)).toContain('data-inscripciones="ausente"');
      }
    );
  });
});
