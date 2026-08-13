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
  sincronizarAlumnos: vi.fn(),
}));

import { SyncButton } from "./sync-button";

// ── Helpers ───────────────────────────────────────────────────

const noop = vi.fn();

function idleState() {
  mockUseActionState.mockReturnValue([{ status: "idle" }, noop]);
}

// ── Tests ─────────────────────────────────────────────────────

describe("SyncButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idleState();
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  describe("estado idle", () => {
    it("renderiza el botón Sincronizar", () => {
      render(<SyncButton comisionId="c1" />);
      expect(screen.getByRole("button", { name: "Sincronizar" })).toBeInTheDocument();
    });

    it("incluye el comisionId como campo oculto", () => {
      const { container } = render(<SyncButton comisionId="abc123" />);
      const hidden = container.querySelector<HTMLInputElement>('[name="comisionId"]');
      expect(hidden?.value).toBe("abc123");
    });

    it("no muestra mensajes de estado", () => {
      render(<SyncButton comisionId="c1" />);
      expect(screen.queryByText(/sincronizados/i)).not.toBeInTheDocument();
    });
  });

  describe("estado ok", () => {
    it("muestra el conteo de alumnos sincronizados", () => {
      mockUseActionState.mockReturnValue([{ status: "ok", sincronizados: 7 }, noop]);
      render(<SyncButton comisionId="c1" />);
      expect(screen.getByText("7 sincronizados")).toBeInTheDocument();
    });

    it("no muestra mensaje de error", () => {
      mockUseActionState.mockReturnValue([{ status: "ok", sincronizados: 3 }, noop]);
      render(<SyncButton comisionId="c1" />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("estado error", () => {
    it("muestra el mensaje de error", () => {
      mockUseActionState.mockReturnValue([
        { status: "error", message: "No se pudo leer la planilla" },
        noop,
      ]);
      render(<SyncButton comisionId="c1" />);
      expect(screen.getByText("No se pudo leer la planilla")).toBeInTheDocument();
    });

    it("no muestra conteo de sincronizados", () => {
      mockUseActionState.mockReturnValue([
        { status: "error", message: "Error" },
        noop,
      ]);
      render(<SyncButton comisionId="c1" />);
      expect(screen.queryByText(/sincronizados/i)).not.toBeInTheDocument();
    });
  });

  describe("estado pending", () => {
    it("muestra 'Sincronizando…' mientras está pendiente", () => {
      mockUseFormStatus.mockReturnValue({ pending: true });
      render(<SyncButton comisionId="c1" />);
      expect(screen.getByRole("button", { name: "Sincronizando…" })).toBeInTheDocument();
    });

    it("el botón está deshabilitado mientras está pendiente", () => {
      mockUseFormStatus.mockReturnValue({ pending: true });
      render(<SyncButton comisionId="c1" />);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("el botón no está deshabilitado en idle", () => {
      render(<SyncButton comisionId="c1" />);
      expect(screen.getByRole("button")).toBeEnabled();
    });
  });
});
