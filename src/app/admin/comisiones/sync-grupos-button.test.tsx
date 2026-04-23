import { render, screen } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────

const mockUseFormState = vi.fn();
const mockUseFormStatus = vi.fn();

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormState: (...args: unknown[]) => mockUseFormState(...args),
    useFormStatus: () => mockUseFormStatus(),
  };
});

vi.mock("./actions", () => ({
  sincronizarGruposDeLaComision: vi.fn(),
}));

import { SyncGruposButton } from "./sync-grupos-button";

// ── Helpers ───────────────────────────────────────────────────

const noop = vi.fn();

function idleState() {
  mockUseFormState.mockReturnValue([{ status: "idle" }, noop]);
}

// ── Tests ─────────────────────────────────────────────────────

describe("SyncGruposButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idleState();
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  describe("estado idle", () => {
    it("renderiza el botón 'Resincronizar grupos'", () => {
      render(<SyncGruposButton comisionId="c1" />);
      expect(
        screen.getByRole("button", { name: "Resincronizar grupos" })
      ).toBeInTheDocument();
    });

    it("incluye el comisionId como campo oculto", () => {
      const { container } = render(<SyncGruposButton comisionId="abc123" />);
      const hidden = container.querySelector<HTMLInputElement>('[name="comisionId"]');
      expect(hidden?.value).toBe("abc123");
    });

    it("no muestra mensajes de estado", () => {
      render(<SyncGruposButton comisionId="c1" />);
      expect(screen.queryByText(/resueltos/i)).not.toBeInTheDocument();
    });
  });

  describe("estado ok", () => {
    it("muestra cuántos quedaron resueltos", () => {
      mockUseFormState.mockReturnValue([
        { status: "ok", sincronizados: 5, aunConError: 0 },
        noop,
      ]);
      render(<SyncGruposButton comisionId="c1" />);
      expect(screen.getByText(/5 resueltos/)).toBeInTheDocument();
      expect(screen.queryByText(/aún con error/)).not.toBeInTheDocument();
    });

    it("muestra cuántos quedaron con error además de los resueltos", () => {
      mockUseFormState.mockReturnValue([
        { status: "ok", sincronizados: 3, aunConError: 2 },
        noop,
      ]);
      render(<SyncGruposButton comisionId="c1" />);
      expect(screen.getByText(/3 resueltos/)).toBeInTheDocument();
      expect(screen.getByText(/2 aún con error/)).toBeInTheDocument();
    });
  });

  describe("estado error", () => {
    it("muestra el mensaje de error", () => {
      mockUseFormState.mockReturnValue([
        { status: "error", message: "Comisión no encontrada" },
        noop,
      ]);
      render(<SyncGruposButton comisionId="c1" />);
      expect(screen.getByText("Comisión no encontrada")).toBeInTheDocument();
    });
  });

  describe("estado pending", () => {
    it("muestra 'Sincronizando…' y desactiva el botón", () => {
      mockUseFormStatus.mockReturnValue({ pending: true });
      render(<SyncGruposButton comisionId="c1" />);
      const btn = screen.getByRole("button", { name: "Sincronizando…" });
      expect(btn).toBeInTheDocument();
      expect(btn).toBeDisabled();
    });
  });
});
