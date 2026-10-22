import { render, screen } from "@testing-library/react";

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

import { SyncCanalesButton } from "./sync-canales-button";

const noop = vi.fn();
// La action llega por prop desde el server component (issue #90).
const actionStub = vi.fn();

describe("SyncCanalesButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActionState.mockReturnValue([{ status: "idle" }, noop]);
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  describe("estado idle", () => {
    it("renderiza el botón y el comisionId como campo oculto", () => {
      const { container } = render(<SyncCanalesButton comisionId="abc" action={actionStub} />);

      expect(screen.getByRole("button", { name: "Reintentar suscripciones" })).toBeInTheDocument();
      expect(container.querySelector<HTMLInputElement>('[name="comisionId"]')?.value).toBe("abc");
    });
  });

  describe("estado ok", () => {
    it("muestra sólo los sincronizados cuando no hay omitidos ni errores", () => {
      mockUseActionState.mockReturnValue([
        { status: "ok", sincronizados: 4, omitidos: 0, aunConError: 0 },
        noop,
      ]);
      render(<SyncCanalesButton comisionId="c1" action={actionStub} />);

      expect(screen.getByText(/4 sincronizados/)).toBeInTheDocument();
      expect(screen.queryByText(/omitidos/)).not.toBeInTheDocument();
      expect(screen.queryByText(/aún con error/)).not.toBeInTheDocument();
    });

    it("muestra omitidos y errores pendientes cuando los hay", () => {
      mockUseActionState.mockReturnValue([
        { status: "ok", sincronizados: 2, omitidos: 1, aunConError: 3 },
        noop,
      ]);
      render(<SyncCanalesButton comisionId="c1" action={actionStub} />);

      expect(screen.getByText(/2 sincronizados/)).toBeInTheDocument();
      expect(screen.getByText(/1 omitidos/)).toBeInTheDocument();
      expect(screen.getByText(/3 aún con error/)).toBeInTheDocument();
    });
  });

  describe("estado error", () => {
    it("muestra el mensaje de error", () => {
      mockUseActionState.mockReturnValue([
        { status: "error", message: "Comisión no encontrada" },
        noop,
      ]);
      render(<SyncCanalesButton comisionId="c1" action={actionStub} />);

      expect(screen.getByText("Comisión no encontrada")).toBeInTheDocument();
    });
  });

  describe("estado pending", () => {
    it("muestra 'Reintentando…' y desactiva el botón", () => {
      mockUseFormStatus.mockReturnValue({ pending: true });
      render(<SyncCanalesButton comisionId="c1" action={actionStub} />);

      const boton = screen.getByRole("button", { name: "Reintentando…" });
      expect(boton).toBeDisabled();
    });
  });
});
