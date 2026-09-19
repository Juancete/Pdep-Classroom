import { render, screen } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────

const mockUseActionState = vi.fn();
const mockUseFormStatus = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (...args: unknown[]) => mockUseActionState(...args),
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => mockUseFormStatus(),
  };
});

vi.mock("../actions", () => ({
  volcarGruposALaPlanilla: vi.fn(),
}));

import { VolcarGruposButton } from "./volcar-grupos-button";

// ── Helpers ───────────────────────────────────────────────────

const noop = vi.fn();

function idleState() {
  mockUseActionState.mockReturnValue([{ status: "idle" }, noop]);
}

// ── Tests ─────────────────────────────────────────────────────

describe("VolcarGruposButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idleState();
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  describe("estado idle", () => {
    it("renderiza el botón con la letra de la columna configurada", () => {
      render(<VolcarGruposButton assignmentId="a1" columna={5} />);
      expect(
        screen.getByRole("button", { name: "Volcar grupos a la planilla (col. F)" })
      ).toBeInTheDocument();
    });

    it("usa la columna A para el índice 0", () => {
      render(<VolcarGruposButton assignmentId="a1" columna={0} />);
      expect(
        screen.getByRole("button", { name: "Volcar grupos a la planilla (col. A)" })
      ).toBeInTheDocument();
    });

    it("incluye el assignmentId como campo oculto", () => {
      const { container } = render(<VolcarGruposButton assignmentId="a2" columna={5} />);
      const hidden = container.querySelector<HTMLInputElement>('[name="assignmentId"]');
      expect(hidden?.value).toBe("a2");
    });

    it("no muestra mensajes de resultado", () => {
      render(<VolcarGruposButton assignmentId="a1" columna={5} />);
      expect(screen.queryByText(/actualizados/i)).not.toBeInTheDocument();
    });
  });

  describe("estado ok", () => {
    it("muestra cuántos alumnos se actualizaron", () => {
      mockUseActionState.mockReturnValue([
        { status: "ok", alumnosEscritos: 12, sinFila: [] },
        noop,
      ]);
      render(<VolcarGruposButton assignmentId="a1" columna={5} />);
      expect(screen.getByText(/12 alumnos actualizados/)).toBeInTheDocument();
      expect(screen.queryByText(/sin fila/)).not.toBeInTheDocument();
    });

    it("muestra cuántos quedaron sin fila además de los actualizados", () => {
      mockUseActionState.mockReturnValue([
        { status: "ok", alumnosEscritos: 10, sinFila: ["forastero1", "forastero2"] },
        noop,
      ]);
      render(<VolcarGruposButton assignmentId="a1" columna={5} />);
      expect(screen.getByText(/10 alumnos actualizados/)).toBeInTheDocument();
      expect(screen.getByText(/2 sin fila en la planilla/)).toBeInTheDocument();
    });

    it("el title lista los usernames sin fila", () => {
      mockUseActionState.mockReturnValue([
        { status: "ok", alumnosEscritos: 10, sinFila: ["forastero1", "forastero2"] },
        noop,
      ]);
      render(<VolcarGruposButton assignmentId="a1" columna={5} />);
      expect(screen.getByText(/10 alumnos actualizados/)).toHaveAttribute(
        "title",
        "forastero1, forastero2"
      );
    });
  });

  describe("estado error", () => {
    it("muestra el mensaje de error", () => {
      mockUseActionState.mockReturnValue([
        {
          status: "error",
          message: "No se pudo escribir en la planilla de la comisión.",
        },
        noop,
      ]);
      render(<VolcarGruposButton assignmentId="a1" columna={5} />);
      expect(
        screen.getByText("No se pudo escribir en la planilla de la comisión.")
      ).toBeInTheDocument();
    });
  });

  describe("estado pending", () => {
    it("muestra 'Volcando…' y desactiva el botón", () => {
      mockUseFormStatus.mockReturnValue({ pending: true });
      render(<VolcarGruposButton assignmentId="a1" columna={5} />);
      const btn = screen.getByRole("button", { name: "Volcando…" });
      expect(btn).toBeInTheDocument();
      expect(btn).toBeDisabled();
    });
  });
});
