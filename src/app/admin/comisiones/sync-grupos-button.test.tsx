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

vi.mock("./actions", () => ({
  sincronizarGruposDeLaComision: vi.fn(),
}));

import { SyncGruposButton } from "./sync-grupos-button";

// ── Helpers ───────────────────────────────────────────────────

const noop = vi.fn();

function idleState() {
  mockUseActionState.mockReturnValue([{ status: "idle" }, noop]);
}

// ── Tests ─────────────────────────────────────────────────────

describe("SyncGruposButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idleState();
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  describe("estado idle", () => {
    it("renderiza el botón de importación", () => {
      render(<SyncGruposButton comisionId="c1" />);
      expect(
        screen.getByRole("button", { name: "Importar grupos desde Sheets" })
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
      mockUseActionState.mockReturnValue([
        { status: "ok", sincronizados: 5, aunConError: 0 },
        noop,
      ]);
      render(<SyncGruposButton comisionId="c1" />);
      expect(screen.getByText(/5 resueltos/)).toBeInTheDocument();
      expect(screen.queryByText(/aún con error/)).not.toBeInTheDocument();
    });

    it("muestra cuántos quedaron con error además de los resueltos", () => {
      mockUseActionState.mockReturnValue([
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
      mockUseActionState.mockReturnValue([
        { status: "error", message: "Comisión no encontrada" },
        noop,
      ]);
      render(<SyncGruposButton comisionId="c1" />);
      expect(screen.getByText("Comisión no encontrada")).toBeInTheDocument();
    });
  });

  describe("estado pending", () => {
    it("muestra 'Importando…' y desactiva el botón", () => {
      mockUseFormStatus.mockReturnValue({ pending: true });
      render(<SyncGruposButton comisionId="c1" />);
      const btn = screen.getByRole("button", { name: "Importando…" });
      expect(btn).toBeInTheDocument();
      expect(btn).toBeDisabled();
    });
  });
});
