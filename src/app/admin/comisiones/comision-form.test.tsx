import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComisionFormState } from "./actions";
import { DEFAULT_COLUMN_CONFIG } from "@/types";

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

import { ComisionForm, hojaSeleccionada } from "./comision-form";

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
function getGruposSheetNameField(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[name="grupos_sheetName"]')!;
}
function getGruposEnabledCheckbox(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="grupos_enabled"]')!;
}
function getModoNombreSelect(container: HTMLElement) {
  return container.querySelector<HTMLSelectElement>('[name="modoNombre"]')!;
}
function getColSelect(container: HTMLElement, name: string) {
  return container.querySelector<HTMLSelectElement>(`[name="${name}"]`);
}
function getPrecargaSinLegajoCheckbox(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>('[name="permitir_precarga_sin_legajo"]')!;
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

    it("si la hoja guardada no existe en la planilla, selecciona la primera y avisa", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Guardar"
          initialSheetNames={["2026", "Notas"]}
          defaultValues={{
            columnConfig: { ...DEFAULT_COLUMN_CONFIG, sheetName: "Alumnos" },
          }}
        />
      );
      const select = getSheetNameField(container) as HTMLSelectElement;
      const opciones = Array.from(select.options).map((option) => option.value);

      expect(opciones).not.toContain("Alumnos");
      expect(select.value).toBe("2026");
      expect(
        screen.getByText('La hoja "Alumnos" no existe en la planilla; se seleccionó "2026".')
      ).toBeInTheDocument();
    });

    it("en el alta, sin hoja guardada, selecciona la primera hoja real sin mostrar aviso", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Crear"
          initialSheetNames={["2026", "Notas"]}
        />
      );
      const select = getSheetNameField(container) as HTMLSelectElement;

      expect(select.value).toBe("2026");
      expect(screen.queryByText(/no existe en la planilla/)).not.toBeInTheDocument();
    });

    it("si la hoja guardada está en la lista, queda seleccionada y las opciones respetan el orden de la planilla", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Guardar"
          initialSheetNames={["Notas", "Alumnos", "Grupos"]}
          defaultValues={{
            columnConfig: { ...DEFAULT_COLUMN_CONFIG, sheetName: "Alumnos" },
          }}
        />
      );
      const select = getSheetNameField(container) as HTMLSelectElement;
      const opciones = Array.from(select.options).map((option) => option.value);

      expect(select.value).toBe("Alumnos");
      expect(opciones).toEqual(["Notas", "Alumnos", "Grupos"]);
      expect(screen.queryByText(/no existe en la planilla/)).not.toBeInTheDocument();
    });

    it("combo de grupos: si la hoja de grupos guardada no existe en la planilla, selecciona la primera y avisa", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Guardar"
          initialSheetNames={["2026", "Notas"]}
          defaultValues={{
            columnConfig: {
              ...DEFAULT_COLUMN_CONFIG,
              sheetName: "2026",
              grupos: {
                sheetName: "Alumnos",
                headerRows: 1,
                githubUsername: 3,
                nombreGrupoPorParadigma: { funcional: 5 },
              },
            },
          }}
        />
      );
      const select = getGruposSheetNameField(container) as HTMLSelectElement;
      const opciones = Array.from(select.options).map((option) => option.value);

      expect(opciones).not.toContain("Alumnos");
      expect(select.value).toBe("2026");
      expect(
        screen.getByText('La hoja "Alumnos" no existe en la planilla; se seleccionó "2026".')
      ).toBeInTheDocument();
    });

    it("combo de grupos: sin hoja de grupos guardada, preselecciona la hoja de alumnos ya resuelta sin avisar", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Crear"
          initialSheetNames={["2026", "Notas"]}
        />
      );

      await user.click(getGruposEnabledCheckbox(container));

      const sheetNameSelect = getSheetNameField(container) as HTMLSelectElement;
      const gruposSelect = getGruposSheetNameField(container) as HTMLSelectElement;

      expect(sheetNameSelect.value).toBe("2026");
      expect(gruposSelect.value).toBe("2026");
      expect(screen.queryByText(/no existe en la planilla/)).not.toBeInTheDocument();
    });
  });

  describe("hojaSeleccionada (función pura)", () => {
    it("devuelve el valor guardado si está en la lista", () => {
      expect(hojaSeleccionada("Notas", ["2026", "Notas"])).toBe("Notas");
    });

    it("devuelve la primera hoja si el valor guardado no está en la lista", () => {
      expect(hojaSeleccionada("Alumnos", ["2026", "Notas"])).toBe("2026");
    });

    it("devuelve la primera hoja si no hay valor guardado", () => {
      expect(hojaSeleccionada(undefined, ["2026", "Notas"])).toBe("2026");
    });

    it("devuelve undefined si la lista de hojas está vacía", () => {
      expect(hojaSeleccionada("Alumnos", [])).toBeUndefined();
    });
  });

  describe("modo de nombre", () => {
    it("por defecto está en modo separado", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getModoNombreSelect(container).value).toBe("separado");
    });

    it("en modo separado muestra apellido y nombre, y oculta nombre completo", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getColSelect(container, "col_apellido")).toBeInTheDocument();
      expect(getColSelect(container, "col_nombre")).toBeInTheDocument();
      expect(getColSelect(container, "col_nombreCompleto")).not.toBeInTheDocument();
    });

    it("al elegir modo completo, muestra nombre completo y oculta apellido/nombre", async () => {
      const user = userEvent.setup();
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);

      await user.selectOptions(getModoNombreSelect(container), "completo");

      expect(getColSelect(container, "col_nombreCompleto")).toBeInTheDocument();
      expect(getColSelect(container, "col_apellido")).not.toBeInTheDocument();
      expect(getColSelect(container, "col_nombre")).not.toBeInTheDocument();
    });

    it("pre-carga modoNombre 'completo' y la columna de nombre completo desde defaultValues", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Guardar"
          defaultValues={{
            columnConfig: { ...DEFAULT_COLUMN_CONFIG, modoNombre: "completo", nombreCompleto: 6 },
          }}
        />
      );
      expect(getModoNombreSelect(container).value).toBe("completo");
      expect(getColSelect(container, "col_nombreCompleto")?.value).toBe("6");
    });

    it("muestra el error de col_nombreCompleto del servidor", () => {
      errorState({ col_nombreCompleto: ["La columna de nombre completo es obligatoria en modo 'completo'"] });
      render(
        <ComisionForm
          action={noop}
          submitLabel="Crear"
          defaultValues={{ columnConfig: { ...DEFAULT_COLUMN_CONFIG, modoNombre: "completo" } }}
        />
      );
      expect(
        screen.getByText("La columna de nombre completo es obligatoria en modo 'completo'")
      ).toBeInTheDocument();
    });
  });

  describe("checkbox de precarga sin legajo", () => {
    it("está desmarcado por defecto", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      expect(getPrecargaSinLegajoCheckbox(container)).not.toBeChecked();
    });

    it("pre-carga permitirPrecargaSinLegajo=true desde defaultValues", () => {
      const { container } = render(
        <ComisionForm
          action={noop}
          submitLabel="Guardar"
          defaultValues={{
            columnConfig: { ...DEFAULT_COLUMN_CONFIG, permitirPrecargaSinLegajo: true },
          }}
        />
      );
      expect(getPrecargaSinLegajoCheckbox(container)).toBeChecked();
    });
  });

  describe("columnas hasta ZZ", () => {
    it("el select de legajo ofrece columnas más allá de Z", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      const select = getColSelect(container, "col_legajo")!;
      const opciones = Array.from(select.options).map((option) => option.value);
      expect(opciones).toContain("701");
    });

    it("la última opción es ZZ", () => {
      const { container } = render(<ComisionForm action={noop} submitLabel="Crear" />);
      const select = getColSelect(container, "col_legajo")!;
      const ultimaOpcion = select.options[select.options.length - 1];
      expect(ultimaOpcion.textContent).toContain("ZZ");
    });
  });
});
