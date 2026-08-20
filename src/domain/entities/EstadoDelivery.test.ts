import { describe, it, expect } from "vitest";
import { EstadoDelivery, NOMBRES_ESTADO_DELIVERY, type NombreEstadoDelivery } from "./EstadoDelivery";

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
  const puede: NombreEstadoDelivery[] = ["recibido", "fallido"];
  const noPuede: NombreEstadoDelivery[] = ["procesando", "procesado", "ignorado"];

  it.each(puede)("puede reprocesarse en '%s'", (nombre) => {
    expect(EstadoDelivery.desdeNombre(nombre).puedeReprocesarse()).toBe(true);
  });

  it.each(noPuede)("no puede reprocesarse en '%s' (ya terminó su ciclo)", (nombre) => {
    expect(EstadoDelivery.desdeNombre(nombre).puedeReprocesarse()).toBe(false);
  });
});
