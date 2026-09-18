import { describe, it, expect, vi } from "vitest";
import {
  RolDeUsuario,
  DOCENTE,
  ESTUDIANTE,
  RESPONSABLE,
  resolverRol,
} from "./RolDeUsuario";
import { AccesoAssignmentProhibidoError, ParticipanteAlumno, ParticipanteDocente } from "./Participante";
import { Alumno } from "./Alumno";
import { Comision } from "./Comision";

function fakeComision(id = "c1"): Comision {
  const comision = new Comision(2026, "sheet-test");
  comision.id = id;
  return comision;
}

function fakeAlumno(comisionId = "c1"): Alumno {
  return Object.assign(new Alumno(), {
    id: "alumno-1",
    githubUsername: "ana",
    comision: fakeComision(comisionId),
  });
}

describe("puedeAdministrar", () => {
  it("Docente tiene alcance administrativo", () => {
    expect(DOCENTE.puedeAdministrar()).toBe(true);
  });

  it("Estudiante no tiene alcance administrativo", () => {
    expect(ESTUDIANTE.puedeAdministrar()).toBe(false);
  });

  it("Responsable también tiene alcance administrativo (hereda de Docente)", () => {
    expect(RESPONSABLE.puedeAdministrar()).toBe(true);
  });
});

describe("puedeGestionarDocentes", () => {
  it("sólo el Responsable puede gestionar docentes", () => {
    expect(RESPONSABLE.puedeGestionarDocentes()).toBe(true);
    expect(DOCENTE.puedeGestionarDocentes()).toBe(false);
    expect(ESTUDIANTE.puedeGestionarDocentes()).toBe(false);
  });
});

describe("navegación por rol", () => {
  it("Docente ve las secciones de admin y termina en Mis TPs", () => {
    const items = DOCENTE.itemsDeNavegacion();
    expect(items.map((item) => item.href)).toEqual([
      "/admin/assignments",
      "/admin/grupos",
      "/admin/alumnos",
      "/admin/comisiones",
      "/admin/operaciones",
      "/dashboard",
    ]);
    expect(items.find((item) => item.href === "/admin/operaciones")?.label).toBe(
      "Diagnóstico"
    );
    expect(items.at(-1)?.label).toBe("Mis TPs");
  });

  it("Estudiante sólo ve Mis TPs", () => {
    expect(ESTUDIANTE.itemsDeNavegacion()).toEqual([{ href: "/dashboard", label: "Mis TPs" }]);
  });

  it("Responsable ve las mismas secciones que Docente más Docentes, y termina en Mis TPs", () => {
    const items = RESPONSABLE.itemsDeNavegacion();
    expect(items.map((item) => item.href)).toEqual([
      "/admin/assignments",
      "/admin/grupos",
      "/admin/alumnos",
      "/admin/comisiones",
      "/admin/operaciones",
      "/admin/docentes",
      "/dashboard",
    ]);
    expect(items.find((item) => item.href === "/admin/docentes")?.label).toBe("Docentes");
  });

  it("solo el Estudiante ve el banner de sincronización", () => {
    expect(ESTUDIANTE.veBannerDeSincronizacion()).toBe(true);
    expect(DOCENTE.veBannerDeSincronizacion()).toBe(false);
    expect(RESPONSABLE.veBannerDeSincronizacion()).toBe(false);
  });
});

describe("rutaDeInicio", () => {
  it("Estudiante aterriza en /dashboard", () => {
    expect(ESTUDIANTE.rutaDeInicio()).toBe("/dashboard");
  });

  it("Docente aterriza en /admin/assignments", () => {
    expect(DOCENTE.rutaDeInicio()).toBe("/admin/assignments");
  });

  it("Responsable hereda la ruta de inicio del Docente", () => {
    expect(RESPONSABLE.rutaDeInicio()).toBe("/admin/assignments");
  });

  it("la ruta de inicio de cada rol es el primer ítem de su navegación", () => {
    for (const rol of [DOCENTE, ESTUDIANTE, RESPONSABLE]) {
      expect(rol.itemsDeNavegacion()[0]?.href).toBe(rol.rutaDeInicio());
    }
  });
});

describe("comoParticipante", () => {
  it("Estudiante construye un ParticipanteAlumno consultando sólo fuentes.alumno", async () => {
    const alumno = fakeAlumno();
    const fuentesAlumno = vi.fn().mockResolvedValue(alumno);
    const fuentesComisionActiva = vi.fn();

    const participante = await ESTUDIANTE.comoParticipante("ana", {
      alumno: fuentesAlumno,
      comisionActiva: fuentesComisionActiva,
    });

    expect(participante).toBeInstanceOf(ParticipanteAlumno);
    expect(participante.alumno).toBe(alumno);
    expect(fuentesAlumno).toHaveBeenCalled();
    expect(fuentesComisionActiva).not.toHaveBeenCalled();
  });

  it("Docente construye un ParticipanteDocente consultando sólo fuentes.comisionActiva", async () => {
    const comisionActiva = fakeComision();
    const fuentesAlumno = vi.fn();
    const fuentesComisionActiva = vi.fn().mockResolvedValue(comisionActiva);

    const participante = await DOCENTE.comoParticipante("profe-docente", {
      alumno: fuentesAlumno,
      comisionActiva: fuentesComisionActiva,
    });

    expect(participante).toBeInstanceOf(ParticipanteDocente);
    expect(participante.alumno).toBeNull();
    expect(participante.githubUsername).toBe("profe-docente");
    expect(fuentesComisionActiva).toHaveBeenCalled();
    expect(fuentesAlumno).not.toHaveBeenCalled();
  });

  it("Responsable hereda el comoParticipante del Docente", async () => {
    const participante = await RESPONSABLE.comoParticipante("responsable1", {
      alumno: vi.fn(),
      comisionActiva: vi.fn().mockResolvedValue(null),
    });
    expect(participante).toBeInstanceOf(ParticipanteDocente);
  });
});

describe("actorSobreMembresiaAjena", () => {
  it("el Docente resuelve siempre y se audita como 'docente'", () => {
    const actor = DOCENTE.actorSobreMembresiaAjena("a1");
    expect(() =>
      actor.autorizarCambioDeMembresia({} as never)
    ).not.toThrow();
    expect(actor.origenDeAuditoria()).toBe("docente");
  });

  it("el Responsable hereda el mismo comportamiento que el Docente", () => {
    const actor = RESPONSABLE.actorSobreMembresiaAjena("a1");
    expect(() => actor.autorizarCambioDeMembresia({} as never)).not.toThrow();
    expect(actor.origenDeAuditoria()).toBe("docente");
  });

  it("el Estudiante nunca administra la membresía de otro", () => {
    expect(() => ESTUDIANTE.actorSobreMembresiaAjena("a1")).toThrow(
      AccesoAssignmentProhibidoError
    );
  });
});

describe("resolverRol", () => {
  it("devuelve RESPONSABLE si es responsable de entorno, sin importar si también es docente activo", () => {
    expect(
      resolverRol({ esResponsableDeEntorno: true, esDocenteActivo: true })
    ).toBe(RESPONSABLE);
    expect(
      resolverRol({ esResponsableDeEntorno: true, esDocenteActivo: false })
    ).toBe(RESPONSABLE);
  });

  it("devuelve DOCENTE si no es responsable pero sí docente activo", () => {
    expect(
      resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: true })
    ).toBe(DOCENTE);
  });

  it("devuelve ESTUDIANTE si no es ni responsable ni docente activo", () => {
    expect(
      resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: false })
    ).toBe(ESTUDIANTE);
  });
});

describe("DOCENTE, ESTUDIANTE y RESPONSABLE son instancias de RolDeUsuario", () => {
  it("son singletons reutilizados", () => {
    expect(DOCENTE).toBeInstanceOf(RolDeUsuario);
    expect(ESTUDIANTE).toBeInstanceOf(RolDeUsuario);
    expect(RESPONSABLE).toBeInstanceOf(RolDeUsuario);
    const rol1 = resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: false });
    const rol2 = resolverRol({ esResponsableDeEntorno: false, esDocenteActivo: false });
    expect(rol1).toBe(ESTUDIANTE);
    expect(rol1).toBe(rol2);
  });
});
