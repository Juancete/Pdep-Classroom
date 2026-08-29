import { describe, it, expect } from "vitest";
import {
  GithubWebhookDelivery,
  VENTANA_PROCESANDO_HUERFANO_MS,
} from "./GithubWebhookDelivery";

function nuevoDelivery(overrides: Partial<GithubWebhookDelivery> = {}): GithubWebhookDelivery {
  const delivery = new GithubWebhookDelivery();
  delivery.deliveryId = "delivery-1";
  delivery.evento = "check_suite";
  return Object.assign(delivery, overrides);
}

// B5 de la auditoría de dominio: antes esta combinación sólo existía como
// SQL en `GithubWebhookDeliveryRepository.reclamar` — `EstadoDelivery.puedeReprocesarse()`
// nunca tenía en cuenta el lease de un "procesando" huérfano, y el panel
// admin (`admin/operaciones/page.tsx`) decidía con `["fallido","recibido"]`
// sin ese caso, que es justo el que un admin necesita reprocesar a mano.
describe("GithubWebhookDelivery.puedeReprocesarse", () => {
  const ahora = new Date("2026-08-28T12:00:00Z");

  it("es reprocesable cuando el estado lo permite (recibido/fallido)", () => {
    expect(nuevoDelivery({ estadoProcesamiento: "recibido" }).puedeReprocesarse(ahora)).toBe(true);
    expect(nuevoDelivery({ estadoProcesamiento: "fallido" }).puedeReprocesarse(ahora)).toBe(true);
  });

  it("no es reprocesable cuando ya terminó su ciclo (procesado/ignorado)", () => {
    expect(nuevoDelivery({ estadoProcesamiento: "procesado" }).puedeReprocesarse(ahora)).toBe(false);
    expect(nuevoDelivery({ estadoProcesamiento: "ignorado" }).puedeReprocesarse(ahora)).toBe(false);
  });

  it("no es reprocesable si está procesando y el lease todavía no venció", () => {
    const delivery = nuevoDelivery({
      estadoProcesamiento: "procesando",
      reclamadoEn: new Date(ahora.getTime() - (VENTANA_PROCESANDO_HUERFANO_MS - 1)),
    });
    expect(delivery.puedeReprocesarse(ahora)).toBe(false);
  });

  it("es reprocesable si quedó procesando con el lease vencido (huérfano)", () => {
    const delivery = nuevoDelivery({
      estadoProcesamiento: "procesando",
      reclamadoEn: new Date(ahora.getTime() - VENTANA_PROCESANDO_HUERFANO_MS),
    });
    expect(delivery.puedeReprocesarse(ahora)).toBe(true);
  });

  it("no es reprocesable si está procesando sin reclamadoEn (estado inconsistente)", () => {
    const delivery = nuevoDelivery({ estadoProcesamiento: "procesando", reclamadoEn: undefined });
    expect(delivery.puedeReprocesarse(ahora)).toBe(false);
  });
});

describe("GithubWebhookDelivery.cerrarComoProcesado / cerrarComoIgnorado", () => {
  it("cerrarComoProcesado limpia payload/error y sella entregaId y procesadoEn", () => {
    const delivery = nuevoDelivery({
      estadoProcesamiento: "procesando",
      payload: { a: 1 },
      error: "algo previo",
    });

    delivery.cerrarComoProcesado("entrega-1");

    expect(delivery.estadoProcesamiento).toBe("procesado");
    expect(delivery.entregaId).toBe("entrega-1");
    expect(delivery.payload).toBeNull();
    expect(delivery.error).toBeNull();
    expect(delivery.procesadoEn).toBeInstanceOf(Date);
  });

  it("cerrarComoIgnorado limpia payload/error sin necesitar entregaId", () => {
    const delivery = nuevoDelivery({
      estadoProcesamiento: "procesando",
      payload: { a: 1 },
    });

    delivery.cerrarComoIgnorado();

    expect(delivery.estadoProcesamiento).toBe("ignorado");
    expect(delivery.entregaId).toBeUndefined();
    expect(delivery.payload).toBeNull();
  });
});

describe("GithubWebhookDelivery.fallar", () => {
  it("cierra en fallido conservando el payload", () => {
    const delivery = nuevoDelivery({
      estadoProcesamiento: "procesando",
      payload: { a: 1 },
    });

    delivery.fallar("timeout de GitHub");

    expect(delivery.estadoProcesamiento).toBe("fallido");
    expect(delivery.error).toBe("timeout de GitHub");
    expect(delivery.payload).toEqual({ a: 1 });
    expect(delivery.procesadoEn).toBeInstanceOf(Date);
  });
});
