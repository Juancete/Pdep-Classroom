import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EstadoQuickActions } from "./estado-quick-actions";
import type { NombreEstadoAssignment } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

function mockFetch(ok: boolean, data: object = {}) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => data }));
}

describe("EstadoQuickActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no renderiza nada si no hay transiciones disponibles", () => {
    const { container } = render(
      <EstadoQuickActions assignmentId="a1" accionesDisponibles={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza un botón ícono por cada transición, con nombre accesible", () => {
    render(
      <EstadoQuickActions
        assignmentId="a1"
        accionesDisponibles={["publicado", "archivado"] as NombreEstadoAssignment[]}
      />
    );
    expect(screen.getByTestId("quick-accion-publicado")).toHaveAccessibleName("Publicar");
    expect(screen.getByTestId("quick-accion-archivado")).toHaveAccessibleName("Archivar");
  });

  it("no llama al endpoint si se cancela la confirmación", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(false);
    mockFetch(true);

    render(
      <EstadoQuickActions
        assignmentId="a1"
        accionesDisponibles={["publicado"] as NombreEstadoAssignment[]}
      />
    );
    await user.click(screen.getByTestId("quick-accion-publicado"));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("llama al endpoint correcto y refresca al confirmar", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    mockFetch(true, { estado: "publicado" });

    render(
      <EstadoQuickActions
        assignmentId="a1"
        accionesDisponibles={["publicado"] as NombreEstadoAssignment[]}
      />
    );
    await user.click(screen.getByTestId("quick-accion-publicado"));

    expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/estado", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "publicado" }),
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it("muestra el error del servidor si la transición falla", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    mockFetch(false, { error: "Ya tiene entregas" });

    render(
      <EstadoQuickActions
        assignmentId="a1"
        accionesDisponibles={["borrador"] as NombreEstadoAssignment[]}
      />
    );
    await user.click(screen.getByTestId("quick-accion-borrador"));

    expect(await screen.findByText("Ya tiene entregas")).toBeInTheDocument();
  });
});
