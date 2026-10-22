import { describe, it, expect } from "vitest";
import {
  EstadoDelivery,
  NOMBRES_ESTADO_DELIVERY,
  VENTANA_PROCESANDO_HUERFANO_MS,
  type NombreEstadoDelivery,
} from "./EstadoDelivery";

describe("EstadoDelivery.desdeNombre", () => {
  it("resuelve una instancia con el nombre correspondiente para cada uno de los cinco estados", () => {
    for (const nombre of NOMBRES_ESTADO_DELIVERY) {
      expect(EstadoDelivery.desdeNombre(nombre).nombre).toBe(nombre);
    }
  });

  it("etiqueta() devuelve texto no vacío para cada estado", () => {
    for (const nombre of NOMBRES_ESTADO_DELIVERY) {
      expect(EstadoDelivery.desdeNombre(nombre).etiqueta().length).toBeGreaterThan(0);
    }
  });
});

describe("EstadoDelivery.puedeReprocesarse", () => {
  const ahora = new Date("2026-01-01T12:00:00Z");
  const puede: NombreEstadoDelivery[] = ["recibido", "fallido"];
  const noPuede: NombreEstadoDelivery[] = ["procesado", "ignorado"];

  it.each(puede)("puede reprocesarse en '%s'", (nombre) => {
    expect(EstadoDelivery.desdeNombre(nombre).puedeReprocesarse({ reclamadoEn: undefined }, ahora)).toBe(true);
  });

  it.each(noPuede)("no puede reprocesarse en '%s' (ya terminó su ciclo)", (nombre) => {
    expect(EstadoDelivery.desdeNombre(nombre).puedeReprocesarse({ reclamadoEn: undefined }, ahora)).toBe(false);
  });

  describe("procesando", () => {
    const procesando = EstadoDelivery.desdeNombre("procesando");
    const reclamadoHace = (milisegundos: number) => ({
      reclamadoEn: new Date(ahora.getTime() - milisegundos),
    });

    it("no es reprocesable con el lease vigente (reclamado hace 119 999 ms)", () => {
      expect(procesando.puedeReprocesarse(reclamadoHace(VENTANA_PROCESANDO_HUERFANO_MS - 1), ahora)).toBe(false);
    });

    it("es reprocesable justo en el límite de la ventana (120 000 ms)", () => {
      expect(procesando.puedeReprocesarse(reclamadoHace(VENTANA_PROCESANDO_HUERFANO_MS), ahora)).toBe(true);
    });

    it("es reprocesable con el lease vencido (5 minutos)", () => {
      expect(procesando.puedeReprocesarse(reclamadoHace(5 * 60_000), ahora)).toBe(true);
    });

    it("no es reprocesable si no tiene reclamadoEn", () => {
      expect(procesando.puedeReprocesarse({ reclamadoEn: undefined }, ahora)).toBe(false);
    });
  });
});
