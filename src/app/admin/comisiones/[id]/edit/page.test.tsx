import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetComision = vi.fn();
const mockCountAlumnos = vi.fn();
const mockGetAlumnos = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getComision: (id: string) => mockGetComision(id),
  countAlumnos: () => mockCountAlumnos(),
}));

vi.mock("@/lib/sheets", () => ({
  getAlumnos: (...args: unknown[]) => mockGetAlumnos(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mockRedirect(path);
    throw new Error("redirect");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("../../actions", () => ({
  actualizarComision: vi.fn(),
  sincronizarAlumnos: vi.fn().mockResolvedValue({ status: "idle" }),
}));

vi.mock("../../sync-button", () => ({
  SyncButton: ({ comisionId }: { comisionId: string }) =>
    React.createElement("button", { "data-testid": "sync-button", "data-comision-id": comisionId }, "Sincronizar"),
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
    columnConfig: {
      sheetName: "Alumnos", headerRows: 1,
      legajo: 0, apellido: 1, nombre: 2,
      githubUsername: 3, email: 4, comision: 5,
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Edit Comision page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetAlumnos.mockResolvedValue([]);
    mockCountAlumnos.mockResolvedValue(0);
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
    expect(renderToStaticMarkup(element as React.ReactElement)).toContain("2026");
  });

  it("renderiza el formulario con submitLabel 'Guardar cambios'", async () => {
    mockGetComision.mockResolvedValue(makeComision());
    const element = await EditComisionPage({ params: { id: "c1" } });
    expect(renderToStaticMarkup(element as React.ReactElement)).toContain('data-submit-label="Guardar cambios"');
  });

  describe("defaultValues pre-populados", () => {
    it("pasa el año como defaultValue", async () => {
      mockGetComision.mockResolvedValue(makeComision({ anio: 2025 }));
      const element = await EditComisionPage({ params: { id: "c1" } });
      expect(renderToStaticMarkup(element as React.ReactElement)).toContain('data-default-anio="2025"');
    });

    it("pasa el spreadsheetId como defaultValue", async () => {
      mockGetComision.mockResolvedValue(makeComision({ spreadsheetId: "mi-sheet-xyz" }));
      const element = await EditComisionPage({ params: { id: "c1" } });
      expect(renderToStaticMarkup(element as React.ReactElement)).toContain("mi-sheet-xyz");
    });

    it("pasa activa como defaultValue", async () => {
      mockGetComision.mockResolvedValue(makeComision({ activa: true }));
      const element = await EditComisionPage({ params: { id: "c1" } });
      expect(renderToStaticMarkup(element as React.ReactElement)).toContain('data-default-activa="true"');
    });
  });

  describe("indicador de sincronización", () => {
    it("no muestra el badge cuando los counts coinciden", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnos.mockResolvedValue(Array(5).fill({}));
      mockCountAlumnos.mockResolvedValue(5);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).not.toContain("Desincronizado");
    });

    it("muestra el badge cuando planilla y DB difieren", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnos.mockResolvedValue(Array(10).fill({}));
      mockCountAlumnos.mockResolvedValue(3);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).toContain("Desincronizado");
      expect(html).toContain("10 en planilla");
      expect(html).toContain("3 en DB");
    });

    it("muestra el botón de sincronizar cuando hay desincronización", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnos.mockResolvedValue(Array(10).fill({}));
      mockCountAlumnos.mockResolvedValue(3);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).toContain('data-testid="sync-button"');
    });

    it("no muestra el botón de sincronizar cuando está sincronizado", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnos.mockResolvedValue(Array(5).fill({}));
      mockCountAlumnos.mockResolvedValue(5);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).not.toContain('data-testid="sync-button"');
    });

    it("no muestra el badge si la planilla falla", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnos.mockRejectedValue(new Error("timeout"));
      mockCountAlumnos.mockResolvedValue(5);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).not.toContain("Desincronizado");
    });

    it("consulta la planilla con el spreadsheetId y columnConfig de la comisión", async () => {
      const comision = makeComision();
      mockGetComision.mockResolvedValue(comision);

      await EditComisionPage({ params: { id: "c1" } });

      expect(mockGetAlumnos).toHaveBeenCalledWith(
        comision.spreadsheetId,
        comision.columnConfig
      );
    });
  });
});
