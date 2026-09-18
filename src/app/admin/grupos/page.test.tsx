import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Comision, resolverContextoDeComision } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetGrupos = vi.fn();
const mockObtenerContextoDeComision = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getGrupos: (filtro: unknown) => mockGetGrupos(filtro),
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

function makeGrupo(overrides?: object) {
  const base = {
    id: "los-lambdas",
    nombre: "Los Lambdas",
    paradigma: "funcional",
    tipoDeIntegrantes: "alumnos",
    usernamesDeMiembros: () => ["juangarcia", "mariaperez"],
    assignment: { id: "a1", titulo: "Kata Funcional" },
  };
  return { ...base, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Grupos page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetGrupos.mockResolvedValue([]);
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
    it("muestra el nombre y paradigma del grupo", async () => {
      mockGetGrupos.mockResolvedValue([makeGrupo()]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Los Lambdas");
      expect(html).toContain("funcional");
    });

    it("muestra los usernames de los miembros", async () => {
      mockGetGrupos.mockResolvedValue([makeGrupo()]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("juangarcia");
      expect(html).toContain("mariaperez");
    });
  });
});
