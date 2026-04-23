import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetComisiones = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getComisiones: () => mockGetComisiones(),
}));

vi.mock("./delete-button", () => ({
  DeleteComisionButton: ({ id, anio }: { id: string; anio: number }) => (
    <button data-id={id}>Eliminar {anio}</button>
  ),
}));

import AdminComisionesPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeComision(overrides?: object) {
  return {
    id: "c1",
    anio: 2026,
    spreadsheetId: "abc123",
    activa: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Comisiones page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetComisiones.mockResolvedValue([]);
    await AdminComisionesPage();
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("muestra el link para crear nueva comisión", async () => {
    mockGetComisiones.mockResolvedValue([]);
    const element = await AdminComisionesPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain('href="/admin/comisiones/new"');
    expect(html).toContain("Nueva Comisión");
  });

  describe("estado vacío", () => {
    it("muestra mensaje cuando no hay comisiones", async () => {
      mockGetComisiones.mockResolvedValue([]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay comisiones todavía");
    });

    it("no muestra ninguna fila cuando no hay comisiones", async () => {
      mockGetComisiones.mockResolvedValue([]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Editar");
    });
  });

  describe("con comisiones", () => {
    it("no muestra el estado vacío cuando hay comisiones", async () => {
      mockGetComisiones.mockResolvedValue([makeComision()]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("No hay comisiones todavía");
    });

    it("muestra el año de la comisión", async () => {
      mockGetComisiones.mockResolvedValue([makeComision({ anio: 2026 })]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("2026");
    });

    it("muestra el spreadsheetId", async () => {
      mockGetComisiones.mockResolvedValue([makeComision({ spreadsheetId: "mi-sheet-id" })]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("mi-sheet-id");
    });

    it("muestra badge 'Activa' para la comisión activa", async () => {
      mockGetComisiones.mockResolvedValue([makeComision({ activa: true })]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Activa");
    });

    it("muestra 'Inactiva' para comisiones inactivas", async () => {
      mockGetComisiones.mockResolvedValue([makeComision({ activa: false })]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Inactiva");
    });

    it("muestra el link de editar por cada comisión", async () => {
      mockGetComisiones.mockResolvedValue([makeComision({ id: "c1" })]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('href="/admin/comisiones/c1/edit"');
      expect(html).toContain("Editar");
    });

    it("muestra el botón de eliminar por cada comisión", async () => {
      mockGetComisiones.mockResolvedValue([makeComision({ id: "c1", anio: 2026 })]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Eliminar 2026");
    });

    it("muestra las cabeceras de la tabla", async () => {
      mockGetComisiones.mockResolvedValue([makeComision()]);
      const element = await AdminComisionesPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Año");
      expect(html).toContain("Planilla");
      expect(html).toContain("Estado");
      expect(html).toContain("Acciones");
    });
  });
});
