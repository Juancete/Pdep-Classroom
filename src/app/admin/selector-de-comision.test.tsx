import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────

const mockCambiarComisionConsultada = vi.fn();

vi.mock("./comision-consultada/actions", () => ({
  cambiarComisionConsultada: (formData: FormData) =>
    mockCambiarComisionConsultada(formData),
}));

import { SelectorDeComision, type OpcionDeComision } from "./selector-de-comision";

// ── Helpers ──────────────────────────────────────────────────

function opcionesDeEjemplo(): OpcionDeComision[] {
  return [
    { id: "c-2026", anio: 2026, activa: true },
    { id: "c-2025", anio: 2025, activa: false },
  ];
}

// ── Tests ────────────────────────────────────────────────────

describe("SelectorDeComision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tiene un label accesible", () => {
    render(
      <SelectorDeComision comisiones={opcionesDeEjemplo()} idSeleccionado="c-2026" />
    );
    expect(screen.getByLabelText("Comisión")).toBeInTheDocument();
  });

  it("marca la opción activa con «(activa)»", () => {
    render(
      <SelectorDeComision comisiones={opcionesDeEjemplo()} idSeleccionado="c-2026" />
    );
    expect(screen.getByRole("option", { name: "2026 (activa)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2025" })).toBeInTheDocument();
  });

  it("preselecciona la comisión consultada", () => {
    render(
      <SelectorDeComision comisiones={opcionesDeEjemplo()} idSeleccionado="c-2025" />
    );
    const select = screen.getByLabelText("Comisión") as HTMLSelectElement;
    expect(select.value).toBe("c-2025");
  });

  it("sin selección agrega una opción placeholder deshabilitada", () => {
    render(<SelectorDeComision comisiones={opcionesDeEjemplo()} idSeleccionado={null} />);
    expect(
      screen.getByRole("option", { name: "Seleccioná una comisión" })
    ).toBeDisabled();
  });

  it("con selección no agrega la opción placeholder", () => {
    render(
      <SelectorDeComision comisiones={opcionesDeEjemplo()} idSeleccionado="c-2026" />
    );
    expect(screen.queryByText("Seleccioná una comisión")).not.toBeInTheDocument();
  });

  it("envía el formulario apenas se elige otra comisión", async () => {
    render(
      <SelectorDeComision comisiones={opcionesDeEjemplo()} idSeleccionado="c-2026" />
    );
    const usuario = userEvent.setup();

    await usuario.selectOptions(screen.getByLabelText("Comisión"), "c-2025");

    expect(mockCambiarComisionConsultada).toHaveBeenCalledOnce();
    const formDataEnviado = mockCambiarComisionConsultada.mock.calls[0][0] as FormData;
    expect(formDataEnviado.get("comisionId")).toBe("c-2025");
  });

  // Regresión: el `<select>` es no controlado (`defaultValue`), que React
  // sólo aplica al montar. `BarraDeComision` le pasa una `key` distinta por
  // cada comisión consultada para forzar el remonte cuando cambia "desde
  // afuera" (botón «Volver a la activa», o la consultada que se eliminó) —
  // sin esa `key`, un simple cambio de prop no le hace efecto al valor ya
  // mostrado. Acá se simula ese remonte con `key` distinta entre renders.
  it("al remontar con otra comisión consultada (key distinta), el select refleja la nueva selección", () => {
    const { rerender } = render(
      <SelectorDeComision
        key="c-2025"
        comisiones={opcionesDeEjemplo()}
        idSeleccionado="c-2025"
      />
    );
    expect((screen.getByLabelText("Comisión") as HTMLSelectElement).value).toBe(
      "c-2025"
    );

    rerender(
      <SelectorDeComision
        key="c-2026"
        comisiones={opcionesDeEjemplo()}
        idSeleccionado="c-2026"
      />
    );

    expect((screen.getByLabelText("Comisión") as HTMLSelectElement).value).toBe(
      "c-2026"
    );
  });
});
