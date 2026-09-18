import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Comision, resolverContextoDeComision } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("./comision-consultada/actions", () => ({
  cambiarComisionConsultada: vi.fn(),
}));

vi.mock("./selector-de-comision", () => ({
  SelectorDeComision: ({
    comisiones,
    idSeleccionado,
  }: {
    comisiones: { id: string; anio: number; activa: boolean }[];
    idSeleccionado: string | null;
  }) => (
    <div
      data-testid="selector-de-comision"
      data-comisiones={JSON.stringify(comisiones)}
      data-id-seleccionado={idSeleccionado ?? ""}
    />
  ),
}));

import { BarraDeComision } from "./barra-de-comision";

// ── Helpers ──────────────────────────────────────────────────
// Construye contextos con la factory real (no se mockea `ContextoDeComision`:
// las vistas sólo le preguntan al contexto, así que el test lo ejercita
// igual que en producción).

function comisionCon(id: string, anio: number, activa: boolean): Comision {
  const comision = new Comision(anio, "sheet-test");
  comision.id = id;
  comision.activa = activa;
  return comision;
}

// ── Tests ────────────────────────────────────────────────────

describe("BarraDeComision", () => {
  it("contexto activo: muestra la descripción y no ofrece volver", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const contexto = resolverContextoDeComision([comisionActiva]);

    render(<BarraDeComision contexto={contexto} comisiones={[comisionActiva]} />);

    expect(screen.getByText("Viendo: 2026 (activa)")).toBeInTheDocument();
    expect(screen.queryByText("Volver a la activa")).not.toBeInTheDocument();
  });

  it("contexto histórico: descripción con la activa y botón volver", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision(
      [comisionActiva, comisionHistorica],
      "c-2025"
    );

    render(
      <BarraDeComision
        contexto={contexto}
        comisiones={[comisionActiva, comisionHistorica]}
      />
    );

    expect(
      screen.getByText("Viendo: 2025 (histórica) · Activa: 2026")
    ).toBeInTheDocument();
    expect(screen.getByText("Volver a la activa")).toBeInTheDocument();
  });

  it("pasa datos planos (no la entidad) y el id consultado al selector", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision(
      [comisionActiva, comisionHistorica],
      "c-2025"
    );

    render(
      <BarraDeComision
        contexto={contexto}
        comisiones={[comisionActiva, comisionHistorica]}
      />
    );

    const selector = screen.getByTestId("selector-de-comision");
    expect(JSON.parse(selector.getAttribute("data-comisiones")!)).toEqual([
      { id: "c-2026", anio: 2026, activa: true },
      { id: "c-2025", anio: 2025, activa: false },
    ]);
    expect(selector.getAttribute("data-id-seleccionado")).toBe("c-2025");
  });

  it("sin comisiones en el sistema no renderiza el selector", () => {
    const contexto = resolverContextoDeComision([]);

    render(<BarraDeComision contexto={contexto} comisiones={[]} />);

    expect(screen.queryByTestId("selector-de-comision")).not.toBeInTheDocument();
  });

  it("sin comisión activa ni consultada no muestra botón volver", () => {
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision([comisionHistorica]);

    render(<BarraDeComision contexto={contexto} comisiones={[comisionHistorica]} />);

    expect(screen.getByText("Sin comisión activa")).toBeInTheDocument();
    expect(screen.queryByText("Volver a la activa")).not.toBeInTheDocument();
  });
});
