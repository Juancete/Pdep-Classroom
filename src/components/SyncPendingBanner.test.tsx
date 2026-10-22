import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

const mockEstadoDelUsuarioActual = vi.fn();

vi.mock("@/application/estadoDeSincronizacion", () => ({
  estadoDeSincronizacionDelUsuarioActual: () => mockEstadoDelUsuarioActual(),
}));

import { SyncPendingBanner } from "./SyncPendingBanner";

// ── Helpers ──────────────────────────────────────────────────

function estado(hayPendientes: boolean, mensaje = "") {
  return { hayPendientes, mensaje, canalesPendientes: [] };
}

// ── Tests ────────────────────────────────────────────────────

describe("SyncPendingBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no renderiza nada si no hay estado (sin usuario, rol sin banner o sin alumno)", async () => {
    mockEstadoDelUsuarioActual.mockResolvedValue(null);
    expect(await SyncPendingBanner()).toBeNull();
  });

  it("no renderiza nada si no hay nada pendiente", async () => {
    mockEstadoDelUsuarioActual.mockResolvedValue(estado(false));
    expect(await SyncPendingBanner()).toBeNull();
  });

  it("renderiza el banner con el mensaje resuelto por el servicio", async () => {
    mockEstadoDelUsuarioActual.mockResolvedValue(
      estado(true, "No pudimos asignarte a tu grupo de TP desde la planilla.")
    );

    const html = renderToStaticMarkup((await SyncPendingBanner()) as React.ReactElement);

    expect(html).toContain("No pudimos asignarte a tu grupo de TP");
    expect(html).toContain('href="/perfil"');
    expect(html).toContain("Reintentar");
  });

  it("renderiza el mensaje combinado que devuelve el servicio", async () => {
    mockEstadoDelUsuarioActual.mockResolvedValue(
      estado(
        true,
        "No pudimos reflejar tus datos de alumno en la planilla ni asignarte a tu grupo de TP desde la planilla."
      )
    );

    const html = renderToStaticMarkup((await SyncPendingBanner()) as React.ReactElement);

    expect(html).toContain("tus datos");
    expect(html).toContain("grupo de TP");
  });

  it("renderiza un canal de comunicación pendiente", async () => {
    mockEstadoDelUsuarioActual.mockResolvedValue(
      estado(true, "No pudimos suscribirte al grupo de Google del curso.")
    );

    const html = renderToStaticMarkup((await SyncPendingBanner()) as React.ReactElement);

    expect(html).toContain("suscribirte al grupo de Google");
    expect(html).toContain('href="/perfil"');
  });
});
