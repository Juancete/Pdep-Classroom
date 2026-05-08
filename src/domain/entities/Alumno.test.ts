import { describe, it, expect } from "vitest";
import { Alumno } from "./Alumno";
import type { Comision } from "./Comision";

function nuevoAlumno(overrides: Partial<Alumno> = {}): Alumno {
  const alumno = new Alumno();
  alumno.legajo = "12345";
  alumno.nombre = "Ana";
  alumno.apellido = "García";
  alumno.githubUsername = "ana-garcia";
  alumno.email = "ana@example.com";
  alumno.gruposSyncFallidoEn = null;
  alumno.alumnoSyncFallidoEn = null;
  return Object.assign(alumno, overrides);
}

function fakeComision(id: string): Comision {
  return { id } as Comision;
}

describe("Alumno.normalizarUsername", () => {
  it("pasa a minúsculas, quita @, y hace trim", () => {
    expect(Alumno.normalizarUsername("@JuanGarcia ")).toBe("juangarcia");
  });

  it("es idempotente", () => {
    const resultado = Alumno.normalizarUsername("@Ana-Garcia ");
    expect(Alumno.normalizarUsername(resultado)).toBe(resultado);
  });

  it("devuelve string vacío para null/undefined", () => {
    expect(Alumno.normalizarUsername(null)).toBe("");
    expect(Alumno.normalizarUsername(undefined)).toBe("");
  });
});

describe("Alumno.normalizarEmail", () => {
  it("pasa a minúsculas y hace trim", () => {
    expect(Alumno.normalizarEmail("  ANA@Example.COM  ")).toBe("ana@example.com");
  });

  it("es idempotente", () => {
    const resultado = Alumno.normalizarEmail("  Ana@Example.COM ");
    expect(Alumno.normalizarEmail(resultado)).toBe(resultado);
  });

  it("devuelve string vacío para null/undefined", () => {
    expect(Alumno.normalizarEmail(null)).toBe("");
    expect(Alumno.normalizarEmail(undefined)).toBe("");
  });
});

describe("Alumno.usernameCanonico", () => {
  it("devuelve el username normalizado del alumno", () => {
    const alumno = nuevoAlumno({ githubUsername: "@AnaGarcia" });
    expect(alumno.usernameCanonico).toBe("anagarcia");
  });

  it("coincide con normalizarUsername aplicado al mismo username", () => {
    const alumno = nuevoAlumno({ githubUsername: "Juan-garcia" });
    expect(alumno.usernameCanonico).toBe(Alumno.normalizarUsername("Juan-garcia"));
  });
});

describe("Alumno.confirmoRegistroEn", () => {
  it("devuelve true cuando registroConfirmadoEn apunta a la comision activa", () => {
    const comision = fakeComision("c1");
    const alumno = nuevoAlumno({ registroConfirmadoEn: comision });

    expect(alumno.confirmoRegistroEn(comision)).toBe(true);
  });

  it("devuelve false cuando registroConfirmadoEn apunta a otra comision", () => {
    const alumno = nuevoAlumno({ registroConfirmadoEn: fakeComision("c-antigua") });

    expect(alumno.confirmoRegistroEn(fakeComision("c-nueva"))).toBe(false);
  });

  it("devuelve false cuando el alumno nunca confirmó", () => {
    const alumno = nuevoAlumno({ registroConfirmadoEn: undefined });

    expect(alumno.confirmoRegistroEn(fakeComision("c1"))).toBe(false);
  });

  it("devuelve false cuando la comision es null", () => {
    const alumno = nuevoAlumno({ registroConfirmadoEn: fakeComision("c1") });

    expect(alumno.confirmoRegistroEn(null)).toBe(false);
  });
});

describe("Alumno.necesitaConfirmarRegistroPara", () => {
  it("devuelve true cuando el alumno no confirmó para la comision activa", () => {
    const alumno = nuevoAlumno({ registroConfirmadoEn: fakeComision("c-antigua") });

    expect(alumno.necesitaConfirmarRegistroPara(fakeComision("c-nueva"))).toBe(true);
  });

  it("devuelve false cuando el alumno ya confirmó para la comision activa", () => {
    const comision = fakeComision("c1");
    const alumno = nuevoAlumno({ registroConfirmadoEn: comision });

    expect(alumno.necesitaConfirmarRegistroPara(comision)).toBe(false);
  });
});

describe("Alumno — predicados de sync", () => {
  describe("tieneSyncDeAlumnoFallido", () => {
    it("devuelve false cuando el flag está limpio", () => {
      const alumno = nuevoAlumno({ alumnoSyncFallidoEn: null });
      expect(alumno.tieneSyncDeAlumnoFallido()).toBe(false);
    });

    it("devuelve true cuando el flag está prendido", () => {
      const alumno = nuevoAlumno({ alumnoSyncFallidoEn: new Date() });
      expect(alumno.tieneSyncDeAlumnoFallido()).toBe(true);
    });
  });

  describe("tieneSyncDeGruposFallido", () => {
    it("devuelve false cuando el flag está limpio", () => {
      const alumno = nuevoAlumno({ gruposSyncFallidoEn: null });
      expect(alumno.tieneSyncDeGruposFallido()).toBe(false);
    });

    it("devuelve true cuando el flag está prendido", () => {
      const alumno = nuevoAlumno({ gruposSyncFallidoEn: new Date() });
      expect(alumno.tieneSyncDeGruposFallido()).toBe(true);
    });
  });

  describe("tieneSyncPendiente", () => {
    it("devuelve false cuando ambos flags están limpios", () => {
      const alumno = nuevoAlumno();
      expect(alumno.tieneSyncPendiente()).toBe(false);
    });

    it("devuelve true cuando solo falló la sync del alumno", () => {
      const alumno = nuevoAlumno({ alumnoSyncFallidoEn: new Date() });
      expect(alumno.tieneSyncPendiente()).toBe(true);
    });

    it("devuelve true cuando solo falló la sync de grupos", () => {
      const alumno = nuevoAlumno({ gruposSyncFallidoEn: new Date() });
      expect(alumno.tieneSyncPendiente()).toBe(true);
    });

    it("devuelve true cuando fallaron ambas syncs", () => {
      const alumno = nuevoAlumno({ alumnoSyncFallidoEn: new Date(), gruposSyncFallidoEn: new Date() });
      expect(alumno.tieneSyncPendiente()).toBe(true);
    });
  });

  describe("mensajeDeSyncPendiente", () => {
    it("devuelve string vacío cuando no hay sync pendiente", () => {
      const alumno = nuevoAlumno();
      expect(alumno.mensajeDeSyncPendiente()).toBe("");
    });

    it("devuelve mensaje de alumno cuando solo falló esa sync", () => {
      const alumno = nuevoAlumno({ alumnoSyncFallidoEn: new Date() });
      expect(alumno.mensajeDeSyncPendiente()).toBe(
        "No pudimos reflejar tus datos de alumno en la planilla."
      );
    });

    it("devuelve mensaje de grupos cuando solo falló esa sync", () => {
      const alumno = nuevoAlumno({ gruposSyncFallidoEn: new Date() });
      expect(alumno.mensajeDeSyncPendiente()).toBe(
        "No pudimos asignarte a tu grupo de TP desde la planilla."
      );
    });

    it("devuelve mensaje combinado cuando fallaron ambas syncs", () => {
      const alumno = nuevoAlumno({ alumnoSyncFallidoEn: new Date(), gruposSyncFallidoEn: new Date() });
      expect(alumno.mensajeDeSyncPendiente()).toBe(
        "No pudimos sincronizar tus datos ni asignarte a tu grupo de TP desde la planilla."
      );
    });
  });
});
