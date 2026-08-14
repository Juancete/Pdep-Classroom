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
    entregasCount: 0,
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
          entregasCount: 3,
        })}
      />
    );
    expect(screen.queryByTestId("accion-borrador")).not.toBeInTheDocument();
    expect(screen.getByText(/con entregas \(3\)/i)).toBeInTheDocument();
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
});
