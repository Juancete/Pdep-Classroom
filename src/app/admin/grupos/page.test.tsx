import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetGrupos = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getGrupos: (paradigma?: string) => mockGetGrupos(paradigma),
}));

import AdminGruposPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeGrupo(overrides?: object) {
  const base = {
    id: "los-lambdas",
    nombre: "Los Lambdas",
    paradigma: "funcional",
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
  });

  it("siempre llama a requireAdmin", async () => {
    await AdminGruposPage({ searchParams: Promise.resolve({}) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  describe("filtro por paradigma", () => {
    it("llama a getGrupos sin filtro si no hay searchParam", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({}) });
      expect(mockGetGrupos).toHaveBeenCalledWith(undefined);
    });

    it("llama a getGrupos con el paradigma si es válido", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "funcional" }) });
      expect(mockGetGrupos).toHaveBeenCalledWith("funcional");
    });

    it("llama a getGrupos con el paradigma 'logico' si es válido", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "logico" }) });
      expect(mockGetGrupos).toHaveBeenCalledWith("logico");
    });

    it("llama a getGrupos con el paradigma 'objetos' si es válido", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "objetos" }) });
      expect(mockGetGrupos).toHaveBeenCalledWith("objetos");
    });

    it("ignora el paradigma y llama sin filtro si el valor no es válido", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "invalido" }) });
      expect(mockGetGrupos).toHaveBeenCalledWith(undefined);
    });

    it("ignora el paradigma si el valor es una string vacía", async () => {
      await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "" }) });
      expect(mockGetGrupos).toHaveBeenCalledWith(undefined);
    });
  });

  describe("render de los filtros de paradigma", () => {
    it('muestra el botón "Todos" siempre', async () => {
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Todos");
    });

    it("muestra los tres paradigmas como opciones de filtro", async () => {
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Funcional");
      expect(html).toContain("Logico");
      expect(html).toContain("Objetos");
    });

    it("marca como activo el filtro seleccionado", async () => {
      const element = await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "funcional" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("bg-pdep-600");
    });

    it('marca "Todos" como activo cuando no hay filtro', async () => {
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("bg-pdep-600");
    });
  });

  describe("estado vacío", () => {
    it("muestra mensaje genérico cuando no hay grupos y no hay filtro", async () => {
      mockGetGrupos.mockResolvedValue([]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay grupos ingresados");
    });

    it("muestra mensaje con el paradigma cuando no hay grupos con filtro activo", async () => {
      mockGetGrupos.mockResolvedValue([]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({ paradigma: "logico" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay grupos para logico");
    });
  });

  describe("con grupos", () => {
    it("muestra el nombre del grupo", async () => {
      mockGetGrupos.mockResolvedValue([makeGrupo({ nombre: "Los Monads" })]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Los Monads");
    });

    it("muestra el paradigma del grupo", async () => {
      mockGetGrupos.mockResolvedValue([makeGrupo({ paradigma: "objetos" })]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("objetos");
    });

    it("muestra el título del assignment al que pertenece el grupo", async () => {
      mockGetGrupos.mockResolvedValue([
        makeGrupo({ assignment: { id: "a1", titulo: "TP Objetos" } }),
      ]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("TP Objetos");
    });

    it("muestra los miembros del grupo", async () => {
      mockGetGrupos.mockResolvedValue([
        makeGrupo({
          usernamesDeMiembros: () => ["user1", "user2", "user3"],
        }),
      ]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("user1");
      expect(html).toContain("user2");
      expect(html).toContain("user3");
    });

    it("renderiza una card por grupo", async () => {
      mockGetGrupos.mockResolvedValue([
        makeGrupo({ id: "g1", nombre: "Grupo A" }),
        makeGrupo({ id: "g2", nombre: "Grupo B" }),
      ]);
      const element = await AdminGruposPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Grupo A");
      expect(html).toContain("Grupo B");
    });
  });
});
