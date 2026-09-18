import { describe, it, expect } from "vitest";
import { Comision } from "./Comision";
import { resolverContextoDeComision } from "./ContextoDeComision";

function comisionCon(id: string, anio: number, activa: boolean): Comision {
  const comision = new Comision(anio, "sheet-test");
  comision.id = id;
  comision.activa = activa;
  return comision;
}

describe("resolverContextoDeComision", () => {
  it("sin id seleccionado devuelve la activa", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision([comisionActiva, comisionHistorica]);

    expect(contexto.comisionConsultada()).toBe(comisionActiva);
    expect(contexto.comisionActiva()).toBe(comisionActiva);
    expect(contexto.esHistorica()).toBe(false);
  });

  it("id seleccionado de una comisión histórica devuelve un contexto histórico", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision(
      [comisionActiva, comisionHistorica],
      "c-2025"
    );

    expect(contexto.comisionConsultada()).toBe(comisionHistorica);
    expect(contexto.comisionActiva()).toBe(comisionActiva);
    expect(contexto.esHistorica()).toBe(true);
  });

  it("id seleccionado que coincide con la activa devuelve un contexto activo", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const contexto = resolverContextoDeComision([comisionActiva], "c-2026");

    expect(contexto.esHistorica()).toBe(false);
    expect(contexto.comisionConsultada()).toBe(comisionActiva);
  });

  it("id seleccionado inexistente cae a la activa", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const contexto = resolverContextoDeComision(
      [comisionActiva],
      "id-que-no-existe"
    );

    expect(contexto.comisionConsultada()).toBe(comisionActiva);
    expect(contexto.esHistorica()).toBe(false);
  });

  it("id seleccionado de una comisión ya eliminada cae a la activa", () => {
    // Mismo caso que "inexistente": la comisión ya no está en la lista
    // vigente de `getComisiones()` (issue #114, nota del plan).
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const contexto = resolverContextoDeComision(
      [comisionActiva],
      "c-2020-borrada"
    );

    expect(contexto.comisionConsultada()).toBe(comisionActiva);
  });

  it("sin comisión activa y sin selección devuelve ContextoSinComision", () => {
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision([comisionHistorica]);

    expect(contexto.comisionConsultada()).toBeNull();
    expect(contexto.comisionActiva()).toBeNull();
    expect(contexto.esHistorica()).toBe(false);
    expect(contexto.permiteCrearAssignments()).toBe(false);
    expect(contexto.ofreceVolverALaActiva()).toBe(false);
  });

  it("histórica sin comisión activa en el sistema", () => {
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision([comisionHistorica], "c-2025");

    expect(contexto.esHistorica()).toBe(true);
    expect(contexto.comisionActiva()).toBeNull();
    expect(contexto.ofreceVolverALaActiva()).toBe(false);
    expect(contexto.descripcion()).toBe("Viendo: 2025 (histórica) · Sin comisión activa");
  });

  it("sin ninguna comisión en el sistema devuelve ContextoSinComision", () => {
    const contexto = resolverContextoDeComision([]);

    expect(contexto.comisionConsultada()).toBeNull();
    expect(contexto.permiteCrearAssignments()).toBe(false);
  });
});

describe("descripcion / permiteCrearAssignments / ofreceVolverALaActiva por subtipo", () => {
  it("contexto activo", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const contexto = resolverContextoDeComision([comisionActiva]);

    expect(contexto.descripcion()).toBe("Viendo: 2026 (activa)");
    expect(contexto.permiteCrearAssignments()).toBe(true);
    expect(contexto.ofreceVolverALaActiva()).toBe(false);
  });

  it("contexto histórico con activa en el sistema", () => {
    const comisionActiva = comisionCon("c-2026", 2026, true);
    const comisionHistorica = comisionCon("c-2025", 2025, false);
    const contexto = resolverContextoDeComision(
      [comisionActiva, comisionHistorica],
      "c-2025"
    );

    expect(contexto.descripcion()).toBe("Viendo: 2025 (histórica) · Activa: 2026");
    expect(contexto.permiteCrearAssignments()).toBe(false);
    expect(contexto.ofreceVolverALaActiva()).toBe(true);
  });

  it("contexto sin comisión", () => {
    const contexto = resolverContextoDeComision([]);

    expect(contexto.descripcion()).toBe("Sin comisión activa");
    expect(contexto.permiteCrearAssignments()).toBe(false);
    expect(contexto.ofreceVolverALaActiva()).toBe(false);
  });
});
