import { describe, it, expect } from "vitest";
import {
  INTEGRANTES_ALUMNOS,
  INTEGRANTES_DOCENTES,
  TipoDeIntegrantes,
} from "./TipoDeIntegrantes";

describe("TipoDeIntegrantes.desdeNombre", () => {
  it("devuelve exactamente las instancias exportadas (identidad)", () => {
    expect(TipoDeIntegrantes.desdeNombre("alumnos")).toBe(INTEGRANTES_ALUMNOS);
    expect(TipoDeIntegrantes.desdeNombre("docentes")).toBe(INTEGRANTES_DOCENTES);
  });

  it("cada instancia conoce su nombre", () => {
    expect(INTEGRANTES_ALUMNOS.nombre).toBe("alumnos");
    expect(INTEGRANTES_DOCENTES.nombre).toBe("docentes");
  });
});

describe("TipoDeIntegrantes.exigeVinculoConAlumno", () => {
  it("alumnos lo exige y docentes no", () => {
    expect(INTEGRANTES_ALUMNOS.exigeVinculoConAlumno()).toBe(true);
    expect(INTEGRANTES_DOCENTES.exigeVinculoConAlumno()).toBe(false);
  });
});

describe("TipoDeIntegrantes.origenDeAuditoria", () => {
  it("alumnos audita como 'alumno' y docentes como 'docente'", () => {
    expect(INTEGRANTES_ALUMNOS.origenDeAuditoria()).toBe("alumno");
    expect(INTEGRANTES_DOCENTES.origenDeAuditoria()).toBe("docente");
  });
});

describe("TipoDeIntegrantes.distintivo", () => {
  it("alumnos no tiene distintivo y docentes es 'Docentes'", () => {
    expect(INTEGRANTES_ALUMNOS.distintivo()).toBeNull();
    expect(INTEGRANTES_DOCENTES.distintivo()).toBe("Docentes");
  });
});
