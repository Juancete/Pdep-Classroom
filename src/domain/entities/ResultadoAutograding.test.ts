import { describe, it, expect } from "vitest";
import {
  ResultadoAutograding,
  resultadoDesdeRun,
  NOMBRES_RESULTADO_AUTOGRADING,
  type NombreResultadoAutograding,
} from "./ResultadoAutograding";

describe("ResultadoAutograding.desdeNombre", () => {
  it("resuelve una instancia con el nombre correspondiente para cada uno de los ocho estados", () => {
    for (const nombre of NOMBRES_RESULTADO_AUTOGRADING) {
      expect(ResultadoAutograding.desdeNombre(nombre).nombre).toBe(nombre);
    }
  });

  it("etiqueta() y detalle() devuelven texto no vacío para cada estado", () => {
    for (const nombre of NOMBRES_RESULTADO_AUTOGRADING) {
      const resultado = ResultadoAutograding.desdeNombre(nombre);
      expect(resultado.etiqueta().length).toBeGreaterThan(0);
      expect(resultado.detalle().length).toBeGreaterThan(0);
    }
  });
});

describe("ResultadoAutograding.permiteReejecucion", () => {
  const permite: NombreResultadoAutograding[] = [
    "aprobado",
    "fallido",
    "cancelado",
    "error_infra",
  ];
  const noPermite: NombreResultadoAutograding[] = [
    "sin_consultar",
    "sin_autograding",
    "sin_ejecuciones",
    "pendiente",
  ];

  it.each(permite)("permite reejecución en '%s' (hay una run previa completa)", (nombre) => {
    expect(ResultadoAutograding.desdeNombre(nombre).permiteReejecucion()).toBe(true);
  });

  it.each(noPermite)("no permite reejecución en '%s'", (nombre) => {
    expect(ResultadoAutograding.desdeNombre(nombre).permiteReejecucion()).toBe(false);
  });
});

describe("ResultadoAutograding.esFinal", () => {
  it("pendiente y los estados 'sin ...' no son finales", () => {
    expect(ResultadoAutograding.desdeNombre("pendiente").esFinal()).toBe(false);
    expect(ResultadoAutograding.desdeNombre("sin_consultar").esFinal()).toBe(false);
    expect(ResultadoAutograding.desdeNombre("sin_ejecuciones").esFinal()).toBe(false);
  });

  it("sin_autograding y los resultados de una ejecución completa sí son finales", () => {
    expect(ResultadoAutograding.desdeNombre("sin_autograding").esFinal()).toBe(true);
    expect(ResultadoAutograding.desdeNombre("aprobado").esFinal()).toBe(true);
    expect(ResultadoAutograding.desdeNombre("fallido").esFinal()).toBe(true);
    expect(ResultadoAutograding.desdeNombre("cancelado").esFinal()).toBe(true);
    expect(ResultadoAutograding.desdeNombre("error_infra").esFinal()).toBe(true);
  });
});

describe("resultadoDesdeRun", () => {
  it("una run que no está 'completed' es siempre pendiente, sin importar conclusion", () => {
    expect(
      resultadoDesdeRun({ status: "in_progress", conclusion: null }).nombre
    ).toBe("pendiente");
    expect(
      resultadoDesdeRun({ status: "queued", conclusion: null }).nombre
    ).toBe("pendiente");
  });

  const casosConclusion: [string, NombreResultadoAutograding][] = [
    ["success", "aprobado"],
    ["failure", "fallido"],
    ["cancelled", "cancelado"],
    ["timed_out", "cancelado"],
    ["startup_failure", "error_infra"],
    ["action_required", "error_infra"],
    ["stale", "error_infra"],
    ["neutral", "error_infra"],
    ["skipped", "error_infra"],
  ];

  it.each(casosConclusion)(
    "conclusion '%s' en una run completa mapea a '%s'",
    (conclusion, esperado) => {
      const resultado = resultadoDesdeRun({ status: "completed", conclusion });
      expect(resultado.nombre).toBe(esperado);
    }
  );

  it("una conclusion desconocida en una run completa cae a error_infra en vez de romper", () => {
    const resultado = resultadoDesdeRun({
      status: "completed",
      conclusion: "algo_que_github_agregue_en_el_futuro",
    });
    expect(resultado.nombre).toBe("error_infra");
  });

  it("conclusion null en una run completa cae a error_infra", () => {
    const resultado = resultadoDesdeRun({ status: "completed", conclusion: null });
    expect(resultado.nombre).toBe("error_infra");
  });
});
