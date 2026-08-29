import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EstadoPanel } from "./estado-panel";
import type { NombreEstadoAssignment } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

function mockFetch(ok: boolean, data: object = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => data })
  );
}

function makeProps(overrides = {}) {
  return {
    assignmentId: "a1",
    estado: "borrador" as const,
    accionesDisponibles: ["publicado", "archivado"] as NombreEstadoAssignment[],
    motivoBloqueoBorrador: null as string | null,
    publicadoEn: null,
    publicadoPor: null,
    archivadoEn: null,
    archivadoPor: null,
    ...overrides,
  };
}

describe("EstadoPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn());
    mockRouterRefresh.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra el badge del estado actual", () => {
    render(<EstadoPanel {...makeProps({ estado: "publicado" })} />);
    expect(screen.getByTestId("estado-badge")).toHaveTextContent("Publicado");
  });

  it("renderiza un botón por cada acción disponible", () => {
    render(
      <EstadoPanel
        {...makeProps({ accionesDisponibles: ["publicado", "archivado"] })}
      />
    );
    expect(screen.getByTestId("accion-publicado")).toHaveTextContent("Publicar");
    expect(screen.getByTestId("accion-archivado")).toHaveTextContent("Archivar");
  });

  it("no muestra el botón de volver a borrador cuando hay entregas", () => {
    render(
      <EstadoPanel
        {...makeProps({
          estado: "publicado",
          accionesDisponibles: ["archivado"],
          motivoBloqueoBorrador:
            'No se puede pasar de "publicado" a "borrador": tiene entregas — archivalo en vez de despublicarlo',
        })}
      />
    );
    expect(screen.queryByTestId("accion-borrador")).not.toBeInTheDocument();
    expect(screen.getByText(/tiene entregas/i)).toBeInTheDocument();
  });

  it("no muestra ningún motivo de bloqueo cuando volver a borrador está permitido", () => {
    render(
      <EstadoPanel
        {...makeProps({
          estado: "publicado",
          accionesDisponibles: ["borrador", "archivado"],
          motivoBloqueoBorrador: null,
        })}
      />
    );
    expect(screen.queryByText(/no se puede pasar/i)).not.toBeInTheDocument();
  });

  it("no llama al endpoint si se cancela la confirmación", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(false);
    mockFetch(true);
    render(<EstadoPanel {...makeProps()} />);

    await user.click(screen.getByTestId("accion-publicado"));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("llama al endpoint con el estado destino al confirmar", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    mockFetch(true, { estado: "publicado" });
    render(<EstadoPanel {...makeProps()} />);

    await user.click(screen.getByTestId("accion-publicado"));

    expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/estado", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "publicado" }),
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it("muestra el error si la transición falla (409)", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    mockFetch(false, { error: "Ya tiene entregas — archivalo en vez de despublicarlo" });
    render(
      <EstadoPanel
        {...makeProps({ estado: "publicado", accionesDisponibles: ["borrador"] })}
      />
    );

    await user.click(screen.getByTestId("accion-borrador"));

    expect(
      await screen.findByText(/archivalo en vez de despublicarlo/)
    ).toBeInTheDocument();
  });

  it("muestra la auditoría de publicación y archivado", () => {
    render(
      <EstadoPanel
        {...makeProps({
          estado: "archivado",
          accionesDisponibles: ["publicado"],
          publicadoEn: "2026-03-12T00:00:00.000Z",
          publicadoPor: "juancete",
          archivadoEn: "2026-08-01T00:00:00.000Z",
          archivadoPor: "docente1",
        })}
      />
    );
    expect(screen.getByText(/@juancete/)).toBeInTheDocument();
    expect(screen.getByText(/@docente1/)).toBeInTheDocument();
  });

  it("formatea la fecha de auditoría en la zona horaria de Argentina, no la del runner", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      // 2026-03-12T00:00:00Z es 2026-03-11 21:00 en Argentina (UTC-3): sin el
      // timeZone explícito, un runner en UTC mostraría 12/3 en vez de 11/3.
      render(
        <EstadoPanel
          {...makeProps({
            estado: "publicado",
            publicadoEn: "2026-03-12T00:00:00.000Z",
            publicadoPor: "docente1",
          })}
        />
      );
      expect(screen.getByText(/11\/3\/2026/)).toBeInTheDocument();
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it("resincroniza estado y acciones cuando cambian las props tras router.refresh()", () => {
    // El padre real monta <EstadoPanel key={assignment.estadoNombre} .../> —
    // el test replica esa key para reproducir el remount tras un cambio real
    // de estado, no un simple rerender con las mismas props "congeladas".
    const { rerender } = render(
      <EstadoPanel
        key="borrador"
        {...makeProps({ estado: "borrador", accionesDisponibles: ["publicado"] })}
      />
    );
    expect(screen.getByTestId("accion-publicado")).toBeInTheDocument();

    rerender(
      <EstadoPanel
        key="publicado"
        {...makeProps({ estado: "publicado", accionesDisponibles: ["borrador", "archivado"] })}
      />
    );

    expect(screen.getByTestId("estado-badge")).toHaveTextContent("Publicado");
    expect(screen.getByTestId("accion-borrador")).toBeInTheDocument();
    expect(screen.getByTestId("accion-archivado")).toBeInTheDocument();
    expect(screen.queryByTestId("accion-publicado")).not.toBeInTheDocument();
  });

  it("no resincroniza (ni hace falta) si la key no cambia entre renders", () => {
    const { rerender } = render(
      <EstadoPanel
        key="publicado"
        {...makeProps({ estado: "publicado", accionesDisponibles: ["archivado"] })}
      />
    );

    // Mismo componente montado, con props DISTINTAS: si el useState interno
    // se resincronizara con cada render (bug), acá pasaría a mostrar
    // accion-borrador. Como la key no cambió, React arrastra el estado local
    // "congelado" del primer render y la UI no debería moverse.
    rerender(
      <EstadoPanel
        key="publicado"
        {...makeProps({ estado: "publicado", accionesDisponibles: ["borrador"] })}
      />
    );

    expect(screen.getByTestId("accion-archivado")).toBeInTheDocument();
    expect(screen.queryByTestId("accion-borrador")).not.toBeInTheDocument();
  });
});
