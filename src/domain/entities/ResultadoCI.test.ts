import { describe, it, expect } from "vitest";
import {
  ResultadoCI,
  resultadoDesdeCheckRuns,
  NOMBRES_RESULTADO_CI,
  type NombreResultadoCI,
} from "./ResultadoCI";

describe("ResultadoCI.desdeNombre", () => {
  it("resuelve una instancia con el nombre correspondiente para cada uno de los siete estados", () => {
    for (const nombre of NOMBRES_RESULTADO_CI) {
      expect(ResultadoCI.desdeNombre(nombre).nombre).toBe(nombre);
    }
  });

  it("etiqueta() y detalle() devuelven texto no vacío para cada estado", () => {
    for (const nombre of NOMBRES_RESULTADO_CI) {
      const resultado = ResultadoCI.desdeNombre(nombre);
      expect(resultado.etiqueta().length).toBeGreaterThan(0);
      expect(resultado.detalle().length).toBeGreaterThan(0);
    }
  });

  it("passing y failing usan el vocabulario en inglés de los badges de CI", () => {
    expect(ResultadoCI.desdeNombre("passing").etiqueta()).toBe("Passing");
    expect(ResultadoCI.desdeNombre("failing").etiqueta()).toBe("Failing");
  });
});

describe("ResultadoCI.permiteReejecucion", () => {
  const permite: NombreResultadoCI[] = ["passing", "failing", "cancelado", "error_infra"];
  const noPermite: NombreResultadoCI[] = ["sin_consultar", "sin_ci", "pendiente"];

  it.each(permite)("permite reejecución en '%s' (hay un check suite previo completo)", (nombre) => {
    expect(ResultadoCI.desdeNombre(nombre).permiteReejecucion()).toBe(true);
  });

  it.each(noPermite)("no permite reejecución en '%s'", (nombre) => {
    expect(ResultadoCI.desdeNombre(nombre).permiteReejecucion()).toBe(false);
  });
});

describe("resultadoDesdeCheckRuns", () => {
  it("sin check runs es sin_ci", () => {
    expect(resultadoDesdeCheckRuns([]).nombre).toBe("sin_ci");
  });

  it("cualquier check run no completado es pendiente, sin importar el resto", () => {
    const runs = [
      { status: "completed", conclusion: "success" as const },
      { status: "in_progress", conclusion: null },
    ];
    expect(resultadoDesdeCheckRuns(runs).nombre).toBe("pendiente");
  });

  it("todos success es passing", () => {
    const runs = [
      { status: "completed", conclusion: "success" as const },
      { status: "completed", conclusion: "success" as const },
    ];
    expect(resultadoDesdeCheckRuns(runs).nombre).toBe("passing");
  });

  it("neutral y skipped no bloquean passing", () => {
    const runs = [
      { status: "completed", conclusion: "success" as const },
      { status: "completed", conclusion: "neutral" as const },
      { status: "completed", conclusion: "skipped" as const },
    ];
    expect(resultadoDesdeCheckRuns(runs).nombre).toBe("passing");
  });

  it("una sola failure entre varios success es failing (peor estado gana)", () => {
    const runs = [
      { status: "completed", conclusion: "success" as const },
      { status: "completed", conclusion: "failure" as const },
    ];
    expect(resultadoDesdeCheckRuns(runs).nombre).toBe("failing");
  });

  it("cancelled o timed_out sin failure es cancelado", () => {
    expect(
      resultadoDesdeCheckRuns([{ status: "completed", conclusion: "cancelled" }]).nombre
    ).toBe("cancelado");
    expect(
      resultadoDesdeCheckRuns([{ status: "completed", conclusion: "timed_out" }]).nombre
    ).toBe("cancelado");
  });

  it("action_required es error_infra", () => {
    expect(
      resultadoDesdeCheckRuns([{ status: "completed", conclusion: "action_required" }]).nombre
    ).toBe("error_infra");
  });

  it("conclusion null en un run completado (caso defensivo) es error_infra", () => {
    expect(
      resultadoDesdeCheckRuns([{ status: "completed", conclusion: null }]).nombre
    ).toBe("error_infra");
  });

  it("failure tiene prioridad sobre action_required y cancelled si coexisten", () => {
    const runs = [
      { status: "completed", conclusion: "action_required" as const },
      { status: "completed", conclusion: "cancelled" as const },
      { status: "completed", conclusion: "failure" as const },
    ];
    expect(resultadoDesdeCheckRuns(runs).nombre).toBe("failing");
  });
});
