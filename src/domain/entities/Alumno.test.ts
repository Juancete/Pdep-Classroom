import { describe, it, expect } from "vitest";
import { Alumno, validateRegistro } from "./Alumno";
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

describe("Alumno.actualizarDatos", () => {
  it("trimmea y normaliza los datos del alumno", () => {
    const alumno = new Alumno();
    const comision = fakeComision("c1");

    alumno.actualizarDatos({
      legajo: " 12345 ",
      nombre: " Ana ",
      apellido: " García ",
      githubUsername: " @AnaGarcia ",
      email: " ANA@Example.COM ",
      comision,
    });

    expect(alumno).toMatchObject({
      legajo: "12345",
      nombre: "Ana",
      apellido: "García",
      githubUsername: "anagarcia",
      email: "ana@example.com",
      comision,
    });
  });

  it("no pisa registroConfirmadoEn cuando el dato viene undefined", () => {
    const comisionActual = fakeComision("activa");
    const comisionConfirmada = fakeComision("confirmada");
    const alumno = nuevoAlumno({ registroConfirmadoEn: comisionConfirmada });

    alumno.actualizarDatos({
      legajo: "54321",
      nombre: "Ana",
      apellido: "García",
      githubUsername: "ana-garcia",
      email: "ana@example.com",
      comision: comisionActual,
    });

    expect(alumno.registroConfirmadoEn).toBe(comisionConfirmada);
  });

  it("actualiza registroConfirmadoEn cuando el dato viene definido", () => {
    const comisionActual = fakeComision("activa");
    const comisionNueva = fakeComision("nueva");
    const alumno = nuevoAlumno({ registroConfirmadoEn: fakeComision("vieja") });

    alumno.actualizarDatos({
      legajo: "54321",
      nombre: "Ana",
      apellido: "García",
      githubUsername: "ana-garcia",
      email: "ana@example.com",
      comision: comisionActual,
      registroConfirmadoEn: comisionNueva,
    });

    expect(alumno.registroConfirmadoEn).toBe(comisionNueva);
  });
});

describe("Alumno.aplicarRegistro", () => {
  it("trimmea y normaliza los campos de registro sin tocar comisión", () => {
    const comisionPrevia = fakeComision("c-previa");
    const alumno = nuevoAlumno({ comision: comisionPrevia });

    alumno.aplicarRegistro({
      legajo: " 99999 ",
      nombre: " Pedro ",
      apellido: " Pérez ",
      githubUsername: " @PedroPerez ",
      email: " PEDRO@Example.COM ",
    });

    expect(alumno.legajo).toBe("99999");
    expect(alumno.nombre).toBe("Pedro");
    expect(alumno.apellido).toBe("Pérez");
    expect(alumno.githubUsername).toBe("pedroperez");
    expect(alumno.email).toBe("pedro@example.com");
    expect(alumno.comision).toBe(comisionPrevia);
  });
});

describe("Alumno.toRegistroInput", () => {
  it("devuelve los campos que espera el registro de Sheets", () => {
    const alumno = nuevoAlumno();

    expect(alumno.toRegistroInput()).toEqual({
      legajo: "12345",
      apellido: "García",
      nombre: "Ana",
      githubUsername: "ana-garcia",
      email: "ana@example.com",
    });
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

describe("Alumno.confirmarRegistroEn", () => {
  it("marca la comisión en la que confirmó registro", () => {
    const comision = fakeComision("c1");
    const alumno = nuevoAlumno();

    alumno.confirmarRegistroEn(comision);

    expect(alumno.registroConfirmadoEn).toBe(comision);
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
  describe("transiciones de sync", () => {
    it("prende y limpia el flag de sync de alumno", () => {
      const fecha = new Date("2026-04-01T00:00:00Z");
      const alumno = nuevoAlumno();

      alumno.marcarSyncDeAlumnoFallido(fecha);
      expect(alumno.alumnoSyncFallidoEn).toBe(fecha);

      alumno.limpiarSyncDeAlumnoFallido();
      expect(alumno.alumnoSyncFallidoEn).toBeNull();
    });

    it("prende y limpia el flag de sync de grupos", () => {
      const fecha = new Date("2026-04-01T00:00:00Z");
      const alumno = nuevoAlumno();

      alumno.marcarSyncDeGruposFallido(fecha);
      expect(alumno.gruposSyncFallidoEn).toBe(fecha);

      alumno.limpiarSyncDeGruposFallido();
      expect(alumno.gruposSyncFallidoEn).toBeNull();
    });
  });

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

describe("validateRegistro", () => {
  const valid = {
    legajo: "12345",
    apellido: "García",
    nombre: "Juan",
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
  };

  it("acepta input válido", () => {
    expect(validateRegistro(valid)).toBeNull();
  });

  it("mantiene los mensajes de error existentes", () => {
    expect(validateRegistro({ ...valid, legajo: "" })).toBe(
      "El legajo debe tener entre 4 y 8 dígitos"
    );
    expect(validateRegistro({ ...valid, apellido: "" })).toBe("El apellido es obligatorio");
    expect(validateRegistro({ ...valid, nombre: "  " })).toBe("El nombre es obligatorio");
    expect(validateRegistro({ ...valid, githubUsername: "" })).toBe(
      "El usuario de GitHub es obligatorio"
    );
    expect(validateRegistro({ ...valid, githubUsername: "user name" })).toBe(
      "El usuario de GitHub no tiene un formato válido"
    );
    expect(validateRegistro({ ...valid, email: "" })).toBe("El email no es válido");
  });

  it("rechaza github username que no es string", () => {
    expect(validateRegistro({ ...valid, githubUsername: 123 as unknown as string })).toBe(
      "El usuario de GitHub debe ser un texto"
    );
  });

  it("no tira TypeError cuando legajo, apellido, nombre o email no son strings", () => {
    expect(() =>
      validateRegistro({ ...valid, legajo: 12345 as unknown as string })
    ).not.toThrow();
    expect(() =>
      validateRegistro({ ...valid, apellido: null as unknown as string })
    ).not.toThrow();
    expect(() =>
      validateRegistro({ ...valid, nombre: undefined as unknown as string })
    ).not.toThrow();
    expect(() =>
      validateRegistro({ ...valid, email: 42 as unknown as string })
    ).not.toThrow();
  });

  it("devuelve error de validación (no null) cuando legajo, apellido, nombre o email no son strings", () => {
    expect(validateRegistro({ ...valid, legajo: 12345 as unknown as string })).not.toBeNull();
    expect(validateRegistro({ ...valid, apellido: null as unknown as string })).not.toBeNull();
    expect(validateRegistro({ ...valid, nombre: undefined as unknown as string })).not.toBeNull();
    expect(validateRegistro({ ...valid, email: 42 as unknown as string })).not.toBeNull();
  });
});
