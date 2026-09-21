import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InscripcionesToggle } from "./inscripciones-toggle";

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

describe("InscripcionesToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterRefresh.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('muestra "Cerrar inscripciones" cuando están abiertas', () => {
    render(<InscripcionesToggle assignmentId="a1" cerradas={false} />);
    expect(screen.getByTestId("toggle-inscripciones")).toHaveTextContent(
      "Cerrar inscripciones"
    );
  });

  it('muestra "Abrir inscripciones" cuando están cerradas', () => {
    render(<InscripcionesToggle assignmentId="a1" cerradas={true} />);
    expect(screen.getByTestId("toggle-inscripciones")).toHaveTextContent(
      "Abrir inscripciones"
    );
  });

  it("llama al endpoint correcto con cerrada=true al cerrar", async () => {
    const user = userEvent.setup();
    mockFetch(true);
    render(<InscripcionesToggle assignmentId="a1" cerradas={false} />);

    await user.click(screen.getByTestId("toggle-inscripciones"));

    expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/inscripciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cerrada: true }),
    });
  });

  it("llama al endpoint correcto con cerrada=false al abrir", async () => {
    const user = userEvent.setup();
    mockFetch(true);
    render(<InscripcionesToggle assignmentId="a1" cerradas={true} />);

    await user.click(screen.getByTestId("toggle-inscripciones"));

    expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/inscripciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cerrada: false }),
    });
  });

  it("llama a router.refresh() después del toggle exitoso", async () => {
    const user = userEvent.setup();
    mockFetch(true);
    render(<InscripcionesToggle assignmentId="a1" cerradas={false} />);

    await user.click(screen.getByTestId("toggle-inscripciones"));

    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it("muestra error si el toggle falla", async () => {
    const user = userEvent.setup();
    mockFetch(false, { error: "Sin permisos" });
    render(<InscripcionesToggle assignmentId="a1" cerradas={false} />);

    await user.click(screen.getByTestId("toggle-inscripciones"));

    expect(await screen.findByText("Sin permisos")).toBeInTheDocument();
  });
});
