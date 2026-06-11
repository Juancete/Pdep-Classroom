import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetComision = vi.fn();
const mockCountAlumnos = vi.fn();
const mockGetAlumnos = vi.fn();
const mockGetSheetNames = vi.fn();
const mockRedirect = vi.fn();
const mockGetAlumnosConGruposSyncPendiente = vi.fn();
const mockGetAlumnosConGoogleGroupPendiente = vi.fn();
const mockIsGoogleGroupsConfigured = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getComision: (id: string) => mockGetComision(id),
  countAlumnos: () => mockCountAlumnos(),
  getAlumnosConGruposSyncPendiente: (...args: unknown[]) =>
    mockGetAlumnosConGruposSyncPendiente(...args),
  getAlumnosConGoogleGroupPendiente: (...args: unknown[]) =>
    mockGetAlumnosConGoogleGroupPendiente(...args),
}));

vi.mock("@/lib/googleGroups", () => ({
  isGoogleGroupsConfigured: () => mockIsGoogleGroupsConfigured(),
}));

vi.mock("@/lib/sheets", () => ({
  getAlumnos: (...args: unknown[]) => mockGetAlumnos(...args),
  getSheetNames: (...args: unknown[]) => mockGetSheetNames(...args),
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
  sincronizarGruposDeLaComision: vi.fn().mockResolvedValue({ status: "idle" }),
}));

vi.mock("../../sync-button", () => ({
  SyncButton: ({ comisionId }: { comisionId: string }) =>
    React.createElement("button", { "data-testid": "sync-button", "data-comision-id": comisionId }, "Sincronizar"),
}));

vi.mock("../../sync-grupos-button", () => ({
  SyncGruposButton: ({ comisionId }: { comisionId: string }) =>
    React.createElement(
      "button",
      { "data-testid": "sync-grupos-button", "data-comision-id": comisionId },
      "Resincronizar grupos"
    ),
}));

vi.mock("../../sync-google-groups-button", () => ({
  SyncGoogleGroupsButton: ({ comisionId }: { comisionId: string }) =>
    React.createElement(
      "button",
      {
        "data-testid": "sync-google-groups-button",
        "data-comision-id": comisionId,
      },
      "Reintentar Google Groups"
    ),
}));

vi.mock("../../comision-form", () => ({
  ComisionForm: ({
    submitLabel,
    defaultValues,
    initialSheetNames,
  }: {
    submitLabel: string;
    defaultValues?: Record<string, unknown>;
    initialSheetNames?: string[];
  }) =>
    React.createElement("div", {
      "data-testid": "comision-form",
      "data-submit-label": submitLabel,
      "data-default-anio": defaultValues?.anio,
      "data-default-spreadsheet-id": defaultValues?.spreadsheetId,
      "data-default-activa": defaultValues?.activa,
      "data-initial-sheet-names": initialSheetNames?.join(","),
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
    mockGetAlumnosConGruposSyncPendiente.mockResolvedValue([]);
    mockGetAlumnosConGoogleGroupPendiente.mockResolvedValue([]);
    mockIsGoogleGroupsConfigured.mockReturnValue(false);
    mockGetSheetNames.mockResolvedValue(["Alumnos", "Grupos"]);
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

    it("pasa los nombres de hojas al formulario cuando getSheetNames responde", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetSheetNames.mockResolvedValue(["Alumnos", "Grupos"]);
      const element = await EditComisionPage({ params: { id: "c1" } });
      expect(renderToStaticMarkup(element as React.ReactElement)).toContain("Alumnos,Grupos");
    });

    it("no pasa initialSheetNames cuando getSheetNames falla, pero la página sigue funcionando", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetSheetNames.mockRejectedValue(new Error("sin acceso"));
      const element = await EditComisionPage({ params: { id: "c1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('data-testid="comision-form"');
      expect(html).not.toContain("data-initial-sheet-names=");
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

  describe("badge de alumnos con grupos pendientes", () => {
    it("muestra el badge + SyncGruposButton cuando hay alumnos con flag prendido", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnosConGruposSyncPendiente.mockResolvedValue([
        { githubUsername: "ana" },
        { githubUsername: "bruno" },
      ]);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).toContain("Grupos pendientes");
      expect(html).toContain("2");
      expect(html).toContain('data-testid="sync-grupos-button"');
    });

    it("muestra la lista con nombres de los alumnos con sync pendiente", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnosConGruposSyncPendiente.mockResolvedValue([
        { githubUsername: "ana", nombre: "Ana", apellido: "García", nombreCompleto: "García, Ana" },
        { githubUsername: "bruno", nombre: "Bruno", apellido: "Ruiz", nombreCompleto: "Ruiz, Bruno" },
      ]);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).toContain('data-testid="pendientes-grupos-lista"');
      expect(html).toContain("García, Ana");
      expect(html).toContain("@ana");
      expect(html).toContain("Ruiz, Bruno");
      expect(html).toContain("@bruno");
    });

    it("no muestra la lista cuando no hay alumnos con sync pendiente", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnosConGruposSyncPendiente.mockResolvedValue([]);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).not.toContain('data-testid="pendientes-grupos-lista"');
    });

    it("no muestra el badge si no hay alumnos pendientes", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnosConGruposSyncPendiente.mockResolvedValue([]);

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).not.toContain("Grupos pendientes");
      expect(html).not.toContain('data-testid="sync-grupos-button"');
    });

    it("no rompe la página si la query de pendientes falla", async () => {
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnosConGruposSyncPendiente.mockRejectedValue(new Error("DB down"));

      const html = renderToStaticMarkup(
        await EditComisionPage({ params: { id: "c1" } }) as React.ReactElement
      );
      expect(html).not.toContain("Grupos pendientes");
    });
  });

  describe("membresías de Google Groups pendientes", () => {
    it("muestra badge, lista y retry cuando la integración está habilitada", async () => {
      mockIsGoogleGroupsConfigured.mockReturnValue(true);
      mockGetComision.mockResolvedValue(makeComision());
      mockGetAlumnosConGoogleGroupPendiente.mockResolvedValue([
        {
          githubUsername: "ana",
          nombreCompleto: "García, Ana",
          googleGroupUltimoError: "Sin permisos para anxxxxxx@utn.edu.ar",
          googleGroupUltimoIntentoEn: new Date("2026-06-10T12:00:00Z"),
        },
      ]);

      const html = renderToStaticMarkup(
        (await EditComisionPage({
          params: { id: "c1" },
        })) as React.ReactElement
      );

      expect(html).toContain("Google Groups pendientes");
      expect(html).toContain("García, Ana");
      expect(html).toContain("Sin permisos");
      expect(html).toContain('data-testid="sync-google-groups-button"');
    });

    it("no consulta ni muestra pendientes cuando la integración está desactivada", async () => {
      mockGetComision.mockResolvedValue(makeComision());

      const html = renderToStaticMarkup(
        (await EditComisionPage({
          params: { id: "c1" },
        })) as React.ReactElement
      );

      expect(mockGetAlumnosConGoogleGroupPendiente).not.toHaveBeenCalled();
      expect(html).not.toContain("Google Groups pendientes");
    });
  });
});
