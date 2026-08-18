import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccionesDeMembresia } from "./acciones-de-membresia";
import type { GrupoDisponible } from "./acciones-de-membresia";

// ── Mocks ────────────────────────────────────────────────────

const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

// ── Helpers ──────────────────────────────────────────────────

function mockFetch(ok: boolean, data: object = {}) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => data }));
}

function makeProps(overrides: Partial<React.ComponentProps<typeof AccionesDeMembresia>> = {}) {
  return {
    assignmentId: "a1",
    grupoId: "g1",
    githubUsername: "ana",
    motivoBloqueo: null as string | null,
    esUltimoMiembro: false,
    gruposDisponibles: [] as GrupoDisponible[],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("AccionesDeMembresia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterRefresh.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("muestra ambos botones habilitados cuando no hay bloqueo", () => {
    render(
      <AccionesDeMembresia
        {...makeProps({ gruposDisponibles: [{ id: "g2", nombre: "Los Monoides" }] })}
      />
    );
    expect(screen.getByRole("button", { name: /salir del grupo/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /cambiarme de grupo/i })).toBeDisabled(); // sin grupo elegido todavía
  });

  it("deshabilita ambos botones y muestra el motivo cuando está bloqueado", () => {
    render(
      <AccionesDeMembresia
        {...makeProps({
          motivoBloqueo: "El grupo ya entregó: ...",
          gruposDisponibles: [{ id: "g2", nombre: "Los Monoides" }],
        })}
      />
    );
    expect(screen.getByTestId("membresia-bloqueada")).toHaveTextContent("El grupo ya entregó: ...");
    expect(screen.getByRole("button", { name: /salir del grupo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cambiarme de grupo/i })).toBeDisabled();
  });

  it("no muestra el selector de destino si no hay grupos disponibles", () => {
    render(<AccionesDeMembresia {...makeProps({ gruposDisponibles: [] })} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cambiarme de grupo/i })).not.toBeInTheDocument();
  });

  it("no llama a fetch si se cancela la confirmación al salir", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetch(true);
    render(<AccionesDeMembresia {...makeProps()} />);

    await user.click(screen.getByRole("button", { name: /salir del grupo/i }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("salir llama al DELETE del grupo actual y refresca", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch(true);
    render(<AccionesDeMembresia {...makeProps()} />);

    await user.click(screen.getByRole("button", { name: /salir del grupo/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/assignments/a1/grupos/g1/miembros/ana",
        { method: "DELETE" }
      );
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it("la confirmación de salir menciona el borrado del grupo cuando es el último integrante", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AccionesDeMembresia {...makeProps({ esUltimoMiembro: true })} />);

    await user.click(screen.getByRole("button", { name: /salir del grupo/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("el grupo se va a eliminar")
    );
  });

  it("la confirmación de salir no menciona el borrado si no es el último integrante", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AccionesDeMembresia {...makeProps({ esUltimoMiembro: false })} />);

    await user.click(screen.getByRole("button", { name: /salir del grupo/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.not.stringContaining("eliminar"));
  });

  it("cambiar llama al PUT del grupo elegido y refresca", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch(true);
    render(
      <AccionesDeMembresia
        {...makeProps({ gruposDisponibles: [{ id: "g2", nombre: "Los Monoides" }] })}
      />
    );

    await user.selectOptions(screen.getByRole("combobox"), "g2");
    await user.click(screen.getByRole("button", { name: /cambiarme de grupo/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/assignments/a1/grupos/g2/miembros/ana",
        { method: "PUT" }
      );
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it("el botón de cambiar sigue deshabilitado hasta elegir un grupo destino", () => {
    render(
      <AccionesDeMembresia
        {...makeProps({ gruposDisponibles: [{ id: "g2", nombre: "Los Monoides" }] })}
      />
    );
    expect(screen.getByRole("button", { name: /cambiarme de grupo/i })).toBeDisabled();
  });

  it("muestra el error del servidor si la salida falla", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch(false, { error: "El grupo ya entregó: ..." });
    render(<AccionesDeMembresia {...makeProps()} />);

    await user.click(screen.getByRole("button", { name: /salir del grupo/i }));

    expect(await screen.findByText("El grupo ya entregó: ...")).toBeInTheDocument();
  });
});
