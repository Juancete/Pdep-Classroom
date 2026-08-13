import { render, screen } from "@testing-library/react";
import type { ComisionFormState } from "./actions";

// ── Mocks ────────────────────────────────────────────────────

const mockUseActionState = vi.fn();
const mockFetchSheetNames = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (...args: unknown[]) => mockUseActionState(...args),
  };
});

vi.mock("./actions", () => ({
  fetchSheetNames: (...args: unknown[]) => mockFetchSheetNames(...args),
}));

import { ComisionForm } from "./comision-form";

// ── Helpers ──────────────────────────────────────────────────

const noop = vi.fn();

function noErrorState() {
  mockUseActionState.mockImplementation(
    (_action: unknown, initial: ComisionFormState) => [initial, noop]
  );
}

function errorState(errors: Record<string, string[]>) {
  mockUseActionState.mockReturnValue([{ ok: false, errors }, noop]);
}

// Los labels no tienen htmlFor — usamos name selector
function getAnioInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="anio"]')!;
}
function getSpreadsheetInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="spreadsheetId"]')!;
}
function getActivaCheckbox(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="activa"]')!;
}
function getSheetNameField(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[name="sheetName"]')!;
}

// ── Tests ────────────────────────────────────────────────────

describe("ComisionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noErrorState();
  });

  describe("campos obligatorios", () => {
    it("renderiza el campo Año", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getAnioInput(container)).toBeInTheDocument();
    });

    it("renderiza el campo Spreadsheet ID", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getSpreadsheetInput(container)).toBeInTheDocument();
    });

    it("renderiza el checkbox 'Comisión activa'", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getActivaCheckbox(container)).toBeInTheDocument();
    });

    it("muestra el label del botón de submit", () => {
      render(<ComisionForm action={noop} submitLabel="Guardar comisión" />);
      expect(
        screen.getByRole("button", { name: "Guardar comisión" })
      ).toBeInTheDocument();
    });
  });

  describe("valores por defecto", () => {
    it("el año por defecto es el año actual", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getAnioInput(container).value).toBe(String(new Date().getFullYear()));
    });

    it("el checkbox 'activa' está desmarcado por defecto", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getActivaCheckbox(container)).not.toBeChecked();
    });

    it("pre-carga el año desde defaultValues", () => {
      const { container } = render(
        <ComisionForm action={noop} submitLabel="Guardar" defaultValues={{ anio: 2023 }} />
      );
      expect(getAnioInput(container).value).toBe("2023");
    });

    it("pre-carga el spreadsheetId desde defaultValues", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Guardar"
          defaultValues={{ spreadsheetId: "ABC123" }}
        />
      );
      expect(getSpreadsheetInput(container).value).toBe("ABC123");
    });

    it("pre-carga activa=true desde defaultValues", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Guardar"
          defaultValues={{ activa: true }}
        />
      );
      expect(getActivaCheckbox(container)).toBeChecked();
    });
  });

  describe("mensajes de error del servidor", () => {
    it("muestra error de año", () => {
      errorState({ anio: ["El año es requerido"] });
      render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(screen.getByText("El año es requerido")).toBeInTheDocument();
    });

    it("muestra error de spreadsheetId", () => {
      errorState({ spreadsheetId: ["ID de planilla inválido"] });
      render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(screen.getByText("ID de planilla inválido")).toBeInTheDocument();
    });
  });

  describe("link de cancelar", () => {
    it("apunta a /admin/comisiones", () => {
      render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(
        screen.getByRole("link", { name: "Cancelar" })
      ).toHaveAttribute("href", "/admin/comisiones");
    });
  });

  describe("campo de nombre de hoja", () => {
    it("muestra un input de texto cuando no hay initialSheetNames", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getSheetNameField(container).tagName).toBe("INPUT");
    });

    it("muestra un select cuando se pasan initialSheetNames", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Crear"
          initialSheetNames={["Alumnos", "Grupos"]}
        />
      );
      expect(getSheetNameField(container).tagName).toBe("SELECT");
    });

    it("el select incluye las hojas provistas", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Crear"
          initialSheetNames={["Alumnos", "Grupos"]}
        />
      );
      const select = getSheetNameField(container) as HTMLSelectElement;
      const opciones = Array.from(select.options).map((option) => option.value);
      expect(opciones).toContain("Alumnos");
      expect(opciones).toContain("Grupos");
    });

    it("muestra el botón 'Cargar hojas'", () => {
      render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(screen.getByRole("button", { name: "Cargar hojas" })).toBeInTheDocument();
    });

    it("muestra el botón 'Recargar hojas' cuando ya hay hojas cargadas", () => {
      render(
        <ComisionForm
          action={noop}
          submitLabel="Crear"
          initialSheetNames={["Alumnos"]}
        />
      );
      expect(screen.getByRole("button", { name: "Recargar hojas" })).toBeInTheDocument();
    });
  });
});
