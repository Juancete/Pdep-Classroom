import { describe, it, expect } from "vitest";
import { SuscripcionAlumno } from "./SuscripcionAlumno";

function nuevaSuscripcion(
  overrides: Partial<SuscripcionAlumno> = {}
): SuscripcionAlumno {
  const suscripcion = new SuscripcionAlumno();
  return Object.assign(suscripcion, overrides);
}

describe("SuscripcionAlumno.estaPendiente", () => {
  it("es true en cualquier estado que no sea sincronizada", () => {
    expect(nuevaSuscripcion({ estado: "pendiente" }).estaPendiente()).toBe(true);
    expect(nuevaSuscripcion({ estado: "fallida" }).estaPendiente()).toBe(true);
    expect(nuevaSuscripcion({ estado: "omitida" }).estaPendiente()).toBe(true);
  });

  it("es false cuando está sincronizada", () => {
    expect(nuevaSuscripcion({ estado: "sincronizada" }).estaPendiente()).toBe(false);
  });
});

describe("SuscripcionAlumno.marcarPendiente", () => {
  it("vuelve a pendiente y limpia el último error", () => {
    const suscripcion = nuevaSuscripcion({
      estado: "fallida",
      ultimoError: "algo falló",
    });

    suscripcion.marcarPendiente();

    expect(suscripcion.estado).toBe("pendiente");
    expect(suscripcion.ultimoError).toBeNull();
  });
});

describe("SuscripcionAlumno.registrarAlta", () => {
  it("acumula destinatarios anteriores para darlos de baja", () => {
    const suscripcion = nuevaSuscripcion({
      destinatarioSincronizado: "primero@dominio.com",
    });

    suscripcion.registrarAlta("segundo@dominio.com");
    suscripcion.registrarAlta("tercero@dominio.com");

    expect(suscripcion.destinatarioSincronizado).toBe("tercero@dominio.com");
    expect(suscripcion.destinatariosPendientesBaja).toEqual([
      "primero@dominio.com",
      "segundo@dominio.com",
    ]);
  });

  it("no deja el destinatario activo pendiente de baja en una secuencia A→B→A", () => {
    const suscripcion = nuevaSuscripcion({
      destinatarioSincronizado: "a@dominio.com",
    });

    suscripcion.registrarAlta("b@dominio.com");
    suscripcion.registrarAlta("a@dominio.com");

    expect(suscripcion.destinatarioSincronizado).toBe("a@dominio.com");
    expect(suscripcion.destinatariosPendientesBaja).toEqual(["b@dominio.com"]);
  });

  it("no acumula nada si es la primera alta", () => {
    const suscripcion = nuevaSuscripcion();

    suscripcion.registrarAlta("nuevo@dominio.com");

    expect(suscripcion.destinatarioSincronizado).toBe("nuevo@dominio.com");
    expect(suscripcion.destinatariosPendientesBaja).toEqual([]);
  });
});

describe("SuscripcionAlumno.registrarBaja", () => {
  it("saca el destinatario de la lista de pendientes de baja", () => {
    const suscripcion = nuevaSuscripcion({
      destinatariosPendientesBaja: ["viejo1@dominio.com", "viejo2@dominio.com"],
    });

    suscripcion.registrarBaja("viejo1@dominio.com");

    expect(suscripcion.destinatariosPendientesBaja).toEqual(["viejo2@dominio.com"]);
  });
});

describe("SuscripcionAlumno.marcarSincronizada", () => {
  it("limpia el error y setea la fecha", () => {
    const fecha = new Date("2026-01-01T00:00:00Z");
    const suscripcion = nuevaSuscripcion({
      estado: "fallida",
      ultimoError: "algo falló",
    });

    suscripcion.marcarSincronizada(fecha);

    expect(suscripcion.estado).toBe("sincronizada");
    expect(suscripcion.ultimoError).toBeNull();
    expect(suscripcion.sincronizadoEn).toBe(fecha);
  });
});

describe("SuscripcionAlumno.marcarFallida", () => {
  it("guarda el error y marca el estado", () => {
    const suscripcion = nuevaSuscripcion();

    suscripcion.marcarFallida("Sin permisos");

    expect(suscripcion.estado).toBe("fallida");
    expect(suscripcion.ultimoError).toBe("Sin permisos");
  });
});

describe("SuscripcionAlumno.marcarOmitida", () => {
  it("marca el estado y limpia el error", () => {
    const suscripcion = nuevaSuscripcion({
      estado: "fallida",
      ultimoError: "algo falló",
    });

    suscripcion.marcarOmitida();

    expect(suscripcion.estado).toBe("omitida");
    expect(suscripcion.ultimoError).toBeNull();
  });
});

describe("SuscripcionAlumno.registrarIntento", () => {
  it("guarda la fecha del intento", () => {
    const fecha = new Date("2026-01-01T00:00:00Z");
    const suscripcion = nuevaSuscripcion();

    suscripcion.registrarIntento(fecha);

    expect(suscripcion.ultimoIntentoEn).toBe(fecha);
  });
});
