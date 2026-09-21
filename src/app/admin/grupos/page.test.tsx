import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Collection } from "@mikro-orm/core";
import {
  Alumno,
  Comision,
  Entrega,
  GrupalAssignment,
  Grupo,
  MiembroDeGrupo,
  resolverContextoDeComision,
} from "@/domain/entities";
import type { GrupoAdminResumen } from "../grupo-resumen";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetGrupos = vi.fn();
const mockGetAlumnosByComision = vi.fn();
const mockGetEntregasDeGrupos = vi.fn();
const mockObtenerContextoDeComision = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getGrupos: (filtro: unknown) => mockGetGrupos(filtro),
  getAlumnosByComision: (comisionId: string) => mockGetAlumnosByComision(comisionId),
  getEntregasDeGrupos: (filtro: unknown) => mockGetEntregasDeGrupos(filtro),
}));

// La card es un client component con router; acá sólo importa qué recibe.
vi.mock("../grupo-card", () => ({
  GrupoCard: ({
    assignmentId,
    grupo,
    conAcciones,
  }: {
    assignmentId: string;
    grupo: GrupoAdminResumen;
    conAcciones: boolean;
  }) => (
    <div
      data-testid="grupo-card"
      data-assignment={assignmentId}
      data-grupo={grupo.id}
      data-con-acciones={String(conAcciones)}
      data-destinos={grupo.destinos.map((destino) => destino.id).join(",")}
      data-entrega={grupo.entrega ? "si" : "no"}
      data-ci={grupo.entrega?.ci ? "si" : "no"}
      data-ultimo-push={grupo.entrega?.ultimoPush ? "si" : "no"}
      data-titulo={grupo.assignmentTitulo}
      data-paradigma={grupo.paradigma}
    >
      {grupo.nombre}
      {grupo.miembros.map((miembro) => (
        <span key={miembro.username}>{miembro.nombreCompleto}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/application/comisionConsultada", () => ({
  obtenerContextoDeComision: () => mockObtenerContextoDeComision(),
}));

import AdminGruposPage from "./page";

// ── Helpers ──────────────────────────────────────────────────
// Contextos armados con la factory real (no se mockea `ContextoDeComision`):
// la página sólo le pregunta al contexto, igual que en producción.

function comisionCon(id: string, anio: number, activa: boolean): Comision {
  const comision = new Comision(anio, "sheet-test");
  comision.id = id;
  comision.activa = activa;
  return comision;
}

function contextoConComisionActiva(id = "c-activa", anio = 2026) {
  const comision = comisionCon(id, anio, true);
  return { contexto: resolverContextoDeComision([comision]), comisiones: [comision] };
}

function contextoConComisionHistorica(id = "c-historica", anio = 2025) {
  const comisionActiva = comisionCon("c-activa", 2026, true);
  const comisionHistorica = comisionCon(id, anio, false);
  return {
    contexto: resolverContextoDeComision([comisionActiva, comisionHistorica], id),
    comisiones: [comisionActiva, comisionHistorica],
  };
}

function contextoSinComision() {
  return { contexto: resolverContextoDeComision([]), comisiones: [] };
}

function makeGrupo(
  id: string,
  overrides: { assignmentId?: string; usernames?: string[]; maxIntegrantes?: number } = {}
): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = `Grupo ${id}`;
  grupo.paradigma = "funcional";
  grupo.maxIntegrantes = overrides.maxIntegrantes ?? 3;
  grupo.assignment = Object.assign(new GrupalAssignment(), {
    id: overrides.assignmentId ?? "a1",
    titulo: "Kata Funcional",
  });
  const items = (overrides.usernames ?? ["juangarcia"]).map((githubUsername) =>
    Object.assign(new MiembroDeGrupo(), { githubUsername })
  );
  grupo.miembros = {
    getItems: () => items,
    get length() {
      return items.length;
    },
  } as unknown as Collection<MiembroDeGrupo>;
  return grupo;
}

function makeEntrega(): Entrega {
  return Object.assign(new Entrega(), {
    repoUrl: "https://github.com/org/repo",
    repoName: "repo",
    provisionEstado: "activa",
    repoDeleted: false,
    ciResultadoNombre: "passing",
    ultimoPushEn: new Date("2026-03-15T12:00:00Z"),
    ultimoPushPor: "ana",
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Grupos page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetGrupos.mockResolvedValue([]);
    mockGetAlumnosByComision.mockResolvedValue([]);
    mockGetEntregasDeGrupos.mockResolvedValue(new Map());
    mockObtenerContextoDeComision.mockResolvedValue(contextoConComisionActiva());
  });

  it("siempre llama a requireAdmin", async () => {
    await AdminGruposPage({ searchParams: Promise.resolve({}) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("sin comisión consultada muestra el aviso y no llama al repo", async () => {
    mockObtenerContextoDeComision.mockResolvedValue(contextoSinComision());

    const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No hay ninguna comisión activa configurada");
    expect(mockGetGrupos).not.toHaveBeenCalled();
  });

  describe("filtro por comisión consultada", () => {
    it("llama a getGrupos con el comisionId de la activa", async () => {
      mockObtenerContextoDeComision.mockResolvedValue(
        contextoConComisionActiva("c-2026")
      );

      await AdminGruposPage({ searchParams: Promise.resolve({}) });

      expect(mockGetGrupos).toHaveBeenCalledWith({
        comisionId: "c-2026",
        paradigma: undefined,
      });
    });

    it("llama a getGrupos con el comisionId de la histórica consultada", async () => {
      mockObtenerContextoDeComision.mockResolvedValue(
        contextoConComisionHistorica("c-2025")
      );

      await AdminGruposPage({ searchParams: Promise.resolve({}) });

      expect(mockGetGrupos).toHaveBeenCalledWith({
        comisionId: "c-2025",
        paradigma: undefined,
      });
    });
  });

  describe("filtro por paradigma", () => {
    it("combina el comisionId consultado sin filtro de paradigma si no hay searchParam", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({}) });
      expect(mockGetGrupos).toHaveBeenCalledWith({
        comisionId: "c-activa",
        paradigma: undefined,
      });
    });

    it("combina el comisionId consultado con el paradigma si es válido", async () => {
      await AdminGruposPage({
        searchParams: Promise.resolve({ paradigma: "funcional" }),
      });
      expect(mockGetGrupos).toHaveBeenCalledWith({
        comisionId: "c-activa",
        paradigma: "funcional",
      });
    });

    it("combina el comisionId consultado con el paradigma 'logico' si es válido", async () => {
      await AdminGruposPage({
        searchParams: Promise.resolve({ paradigma: "logico" }),
      });
      expect(mockGetGrupos).toHaveBeenCalledWith({
        comisionId: "c-activa",
        paradigma: "logico",
      });
    });

    it("ignora un paradigma inválido en el query string", async () => {
      await AdminGruposPage({
        searchParams: Promise.resolve({ paradigma: "basura" }),
      });
      expect(mockGetGrupos).toHaveBeenCalledWith({
        comisionId: "c-activa",
        paradigma: undefined,
      });
    });
  });

  describe("estado vacío", () => {
    it("muestra mensaje cuando no hay grupos", async () => {
      mockGetGrupos.mockResolvedValue([]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay grupos ingresados");
    });
  });

  describe("barra de comisión consultada", () => {
    it("renderiza la barra con la descripción del contexto", async () => {
      mockObtenerContextoDeComision.mockResolvedValue(
        contextoConComisionActiva("c-2026", 2026)
      );

      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);

      expect(html).toContain("Viendo: 2026 (activa)");
    });

    it("sin comisión consultada pero con históricas disponibles, muestra el selector", async () => {
      const comisionHistorica = comisionCon("c-2025", 2025, false);
      mockObtenerContextoDeComision.mockResolvedValue({
        contexto: resolverContextoDeComision([comisionHistorica]),
        comisiones: [comisionHistorica],
      });

      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);

      expect(html).toContain("Sin comisión activa");
      expect(html).toContain('id="selector-comision-consultada"');
    });
  });

  describe("con grupos", () => {
    it("muestra el nombre del grupo", async () => {
      mockGetGrupos.mockResolvedValue([makeGrupo("g1", { usernames: ["juangarcia", "mariaperez"] })]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      expect(renderToStaticMarkup(element)).toContain("Grupo g1");
    });

    it("muestra el nombre completo de los miembros, con fallback al username", async () => {
      mockGetGrupos.mockResolvedValue([makeGrupo("g1", { usernames: ["JuanGarcia", "mariaperez"] })]);
      mockGetAlumnosByComision.mockResolvedValue([
        Object.assign(new Alumno(), { githubUsername: "JuanGarcia", apellido: "García", nombre: "Juan" }),
      ]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("García, Juan");
      expect(html).toContain("mariaperez");
    });

    it("monta la card sin acciones, una por grupo, con el assignment del grupo y su contexto", async () => {
      mockGetGrupos.mockResolvedValue([
        makeGrupo("g1", { assignmentId: "a1" }),
        makeGrupo("g2", { assignmentId: "a2" }),
      ]);
      const html = renderToStaticMarkup(
        await AdminGruposPage({ searchParams: Promise.resolve({}) })
      );
      expect(html).toContain('data-assignment="a1"');
      expect(html).toContain('data-assignment="a2"');
      expect(html.match(/data-testid="grupo-card"/g)).toHaveLength(2);
      expect(html.match(/data-con-acciones="false"/g)).toHaveLength(2);
      expect(html).toContain('data-titulo="Kata Funcional"');
      expect(html).toContain('data-paradigma="funcional"');
    });

    it("los destinos de un grupo son sólo los de su mismo TP, aunque otro TP tenga el mismo paradigma", async () => {
      mockGetGrupos.mockResolvedValue([
        makeGrupo("g1", { assignmentId: "a1" }),
        makeGrupo("g2", { assignmentId: "a1" }),
        makeGrupo("g3", { assignmentId: "a2" }),
      ]);
      const html = renderToStaticMarkup(
        await AdminGruposPage({ searchParams: Promise.resolve({}) })
      );
      expect(html).toContain('data-grupo="g1" data-con-acciones="false" data-destinos="g2"');
      expect(html).toContain('data-grupo="g3" data-con-acciones="false" data-destinos=""');
    });

    it("la entrega llega al resumen sin CI ni último push", async () => {
      mockGetGrupos.mockResolvedValue([makeGrupo("g1"), makeGrupo("g2")]);
      mockGetEntregasDeGrupos.mockResolvedValue(new Map([["g1", makeEntrega()]]));
      const html = renderToStaticMarkup(
        await AdminGruposPage({ searchParams: Promise.resolve({}) })
      );
      expect(html).toContain('data-grupo="g1" data-con-acciones="false" data-destinos="g2" data-entrega="si" data-ci="no" data-ultimo-push="no"');
      expect(html).toContain('data-grupo="g2" data-con-acciones="false" data-destinos="g1" data-entrega="no"');
    });

    it("pide las entregas con el mismo comisionId y paradigma que los grupos, y los alumnos de la comisión", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "funcional" }) });

      expect(mockGetGrupos).toHaveBeenCalledWith({ comisionId: "c-activa", paradigma: "funcional" });
      expect(mockGetEntregasDeGrupos).toHaveBeenCalledWith({
        comisionId: "c-activa",
        paradigma: "funcional",
      });
      expect(mockGetAlumnosByComision).toHaveBeenCalledWith("c-activa");
    });
  });
});
