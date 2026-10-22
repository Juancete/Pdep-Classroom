import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetWebhookDeliveryOverview = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockListarTemplates = vi.fn();
const mockGetConfiguracionDeApp = vi.fn();
const mockGetSheetNames = vi.fn();
const mockGetPermisoDePlanilla = vi.fn();
const mockEvaluarConfiguracionDeApp = vi.fn();
const mockEvaluarPermisoDePlanilla = vi.fn();
const canalesDeComunicacion: { etiqueta: string; estaConfigurado: () => boolean }[] = [];

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getWebhookDeliveryOverview: () => mockGetWebhookDeliveryOverview(),
  getComisionActiva: () => mockGetComisionActiva(),
}));

vi.mock("@/infrastructure/github", () => ({
  listarTemplates: () => mockListarTemplates(),
  getConfiguracionDeApp: () => mockGetConfiguracionDeApp(),
}));

vi.mock("@/infrastructure/sheets", () => ({
  getSheetNames: (...args: unknown[]) => mockGetSheetNames(...args),
  getPermisoDePlanilla: (...args: unknown[]) => mockGetPermisoDePlanilla(...args),
}));

vi.mock("@/application/diagnosticoGithubApp", () => ({
  evaluarConfiguracionDeApp: (...args: unknown[]) => mockEvaluarConfiguracionDeApp(...args),
}));

vi.mock("@/application/diagnosticoPlanilla", () => ({
  evaluarPermisoDePlanilla: (...args: unknown[]) => mockEvaluarPermisoDePlanilla(...args),
}));

vi.mock("@/infrastructure/canales", () => ({
  get CANALES_DE_COMUNICACION() {
    return canalesDeComunicacion;
  },
}));

vi.mock("./reprocess-button", () => ({
  ReprocessWebhookButton: ({ deliveryId }: { deliveryId?: string }) => (
    <button data-testid="reprocesar" data-delivery={deliveryId ?? "global"} />
  ),
}));

import OperacionesPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    deliveryId: "d1",
    recibidoEn: new Date("2026-01-01T10:00:00Z"),
    evento: "check_suite",
    accion: "completed",
    repoName: "tp-x",
    estadoProcesamiento: "procesado",
    intentos: 1,
    error: null,
    puedeReprocesarse: false,
    ...overrides,
  };
}

function overview(overrides: Record<string, unknown> = {}) {
  return {
    pendientes: 0,
    fallidos: 0,
    ultimoRecibidoEn: new Date("2026-01-01T10:00:00Z"),
    items: [],
    ...overrides,
  };
}

async function renderizar() {
  return renderToStaticMarkup(await OperacionesPage());
}

function contar(html: string, texto: string) {
  return html.split(texto).length - 1;
}

// ── Tests ────────────────────────────────────────────────────

describe("OperacionesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "secreto");
    canalesDeComunicacion.length = 0;
    mockRequireAdmin.mockResolvedValue({});
    mockGetWebhookDeliveryOverview.mockResolvedValue(overview());
    mockGetComisionActiva.mockResolvedValue({ spreadsheetId: "hoja-1" });
    mockListarTemplates.mockResolvedValue([{}, {}]);
    mockGetConfiguracionDeApp.mockResolvedValue({});
    mockGetSheetNames.mockResolvedValue(["A", "B", "C"]);
    mockGetPermisoDePlanilla.mockResolvedValue({});
    mockEvaluarConfiguracionDeApp.mockReturnValue({ ok: true, detalle: "Permisos correctos" });
    mockEvaluarPermisoDePlanilla.mockReturnValue({ ok: true, detalle: "Escritura permitida" });
  });

  it("con todo en orden marca cada check como OK", async () => {
    const html = await renderizar();

    expect(contar(html, "OK · ")).toBe(6);
    expect(html).not.toContain("Revisar");
    expect(html).toContain("2 templates accesibles");
    expect(html).toContain("3 hojas accesibles");
  });

  it("un check que rechaza se marca como Revisar con su mensaje", async () => {
    mockListarTemplates.mockRejectedValue(new Error("GitHub caído"));

    const html = await renderizar();

    expect(html).toContain("Revisar · GitHub App");
    expect(html).toContain("GitHub caído");
    expect(contar(html, "Revisar")).toBe(1);
  });

  it("un diagnóstico evaluado como no ok se marca como Revisar", async () => {
    mockEvaluarPermisoDePlanilla.mockReturnValue({ ok: false, detalle: "Falta rol Editor" });

    const html = await renderizar();

    expect(html).toContain("Revisar · Google Sheets: escritura");
    expect(html).toContain("Falta rol Editor");
  });

  it("sin comisión activa los checks de Sheets dicen que no hay comisión", async () => {
    mockGetComisionActiva.mockResolvedValue(null);

    const html = await renderizar();

    expect(contar(html, "No hay comisión activa")).toBe(2);
    expect(html).toContain("Revisar · Google Sheets");
    expect(mockGetSheetNames).not.toHaveBeenCalled();
    expect(mockGetPermisoDePlanilla).not.toHaveBeenCalled();
  });

  it("los canales de comunicación reflejan si están configurados", async () => {
    canalesDeComunicacion.push(
      { etiqueta: "Google Groups", estaConfigurado: () => true },
      { etiqueta: "Slack", estaConfigurado: () => false }
    );

    const html = await renderizar();

    expect(html).toContain("OK · Google Groups");
    expect(html).toContain("Revisar · Slack");
    expect(html).toContain("Integración desactivada o incompleta");
  });

  it("el check de Webhook depende del secreto configurado", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");

    const html = await renderizar();

    expect(html).toContain("Revisar · Webhook");
  });

  describe("botón global de reprocesar", () => {
    it("no aparece sin pendientes ni fallidos", async () => {
      const html = await renderizar();

      expect(html).not.toContain('data-delivery="global"');
    });

    it("aparece con pendientes", async () => {
      mockGetWebhookDeliveryOverview.mockResolvedValue(overview({ pendientes: 2 }));

      expect(await renderizar()).toContain('data-delivery="global"');
    });

    it("aparece con fallidos", async () => {
      mockGetWebhookDeliveryOverview.mockResolvedValue(overview({ fallidos: 1 }));

      expect(await renderizar()).toContain('data-delivery="global"');
    });
  });

  describe("tabla de deliveries", () => {
    it("sin deliveries muestra el mensaje vacío", async () => {
      expect(await renderizar()).toContain("Todavía no hay deliveries.");
    });

    it("una fila que puede reprocesarse muestra el botón por delivery", async () => {
      mockGetWebhookDeliveryOverview.mockResolvedValue(
        overview({ items: [item({ puedeReprocesarse: true, deliveryId: "d-fallido", error: "boom" })] })
      );

      const html = await renderizar();

      expect(html).toContain('data-delivery="d-fallido"');
      expect(html).toContain("check_suite.completed");
      expect(html).toContain("boom");
    });

    it("una fila que no puede reprocesarse no muestra botón", async () => {
      mockGetWebhookDeliveryOverview.mockResolvedValue(overview({ items: [item()] }));

      const html = await renderizar();

      expect(html).not.toContain("data-testid=\"reprocesar\"");
      expect(html).toContain("tp-x");
    });
  });
});
