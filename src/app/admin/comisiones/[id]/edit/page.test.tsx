import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetComision = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getComision: (id: string) => mockGetComision(id),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mockRedirect(path);
    throw new Error("redirect");
  },
}));

vi.mock("../../actions", () => ({
  actualizarComision: vi.fn(),
}));

vi.mock("../../comision-form", () => ({
  ComisionForm: ({
    submitLabel,
    defaultValues,
  }: {
    submitLabel: string;
    defaultValues?: Record<string, unknown>;
  }) =>
    React.createElement("div", {
      "data-testid": "comision-form",
      "data-submit-label": submitLabel,
      "data-default-anio": defaultValues?.anio,
      "data-default-spreadsheet-id": defaultValues?.spreadsheetId,
      "data-default-activa": defaultValues?.activa,
    }),
}));

import EditComisionPage from "./page";

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

describe("Edit Comision page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetComision.mockResolvedValue(makeComision());
    await EditComisionPage({ params: { id: "c1" } });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/comisiones si la comisión no existe", async () => {
    mockGetComision.mockResolvedValue(null);
    await expect(EditComisionPage({ params: { id: "no-existe" } })).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/comisiones");
  });

  it("muestra el título con el año de la comisión", async () => {
    mockGetComision.mockResolvedValue(makeComision({ anio: 2026 }));
    const element = await EditComisionPage({ params: { id: "c1" } });
    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain("2026");
  });

  it("renderiza el formulario con submitLabel 'Guardar cambios'", async () => {
    mockGetComision.mockResolvedValue(makeComision());
    const element = await EditComisionPage({ params: { id: "c1" } });
    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain('data-submit-label="Guardar cambios"');
  });

  describe("defaultValues pre-populados", () => {
    it("pasa el año como defaultValue", async () => {
      mockGetComision.mockResolvedValue(makeComision({ anio: 2025 }));
      const element = await EditComisionPage({ params: { id: "c1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('data-default-anio="2025"');
    });

    it("pasa el spreadsheetId como defaultValue", async () => {
      mockGetComision.mockResolvedValue(makeComision({ spreadsheetId: "mi-sheet-xyz" }));
      const element = await EditComisionPage({ params: { id: "c1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("mi-sheet-xyz");
    });

    it("pasa activa como defaultValue", async () => {
      mockGetComision.mockResolvedValue(makeComision({ activa: true }));
      const element = await EditComisionPage({ params: { id: "c1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('data-default-activa="true"');
    });
  });
});
