import { describe, it, expect } from "vitest";
import {
  RolDeUsuario,
  DOCENTE,
  ESTUDIANTE,
  resolverRol,
  AccesoAssignmentProhibidoError,
} from "./RolDeUsuario";
import { AssignmentNoDisponibleError } from "./Assignment";
import { GrupalAssignment } from "./GrupalAssignment";
import { Grupo, InscripcionesCerradasError, GrupoConEntregaError } from "./Grupo";
import { IndividualAssignment } from "./IndividualAssignment";
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

function fakeAssignmentPublicado(comisionId: string | null = "c1"): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.comision = comisionId ? fakeComision(comisionId) : undefined;
  assignment.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  return assignment;
}

function fakeAssignmentBorrador(comisionId: string | null = "c1"): IndividualAssignment {
  const assignment = new IndividualAssignment();
  assignment.id = "a1";
  assignment.comision = comisionId ? fakeComision(comisionId) : undefined;
  return assignment;
}

function fakeGrupal(overrides: Partial<GrupalAssignment> = {}): GrupalAssignment {
  const grupal = new GrupalAssignment();
  grupal.id = "a1";
  grupal.maxIntegrantes = 3;
  grupal.comision = fakeComision();
  grupal.inscripcionesCerradas = false;
  grupal.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  Object.assign(grupal, overrides);
  return grupal;
}

function fakeGrupo(id = "g1"): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = "Los Lambdas";
  grupo.nombreNormalizado = "los-lambdas";
  return grupo;
}

describe("Estudiante.autorizarAccesoAssignment", () => {
  it("permite al alumno de la misma comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(fakeAlumno("c1"), fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("rechaza al alumno de otra comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(fakeAlumno("c2"), fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza sin alumno registrado", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(null, fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza assignments históricos sin comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccesoAssignment(fakeAlumno("c1"), fakeAssignmentPublicado(null))
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

describe("Docente.autorizarAccesoAssignment", () => {
  it("permite acceso global, sin alumno y sin comisión", () => {
    expect(() =>
      DOCENTE.autorizarAccesoAssignment(null, fakeAssignmentPublicado(null))
    ).not.toThrow();
  });
});

describe("Estudiante.autorizarAccionSobreAssignment", () => {
  it("permite sobre un assignment publicado de la comisión", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccionSobreAssignment(fakeAlumno("c1"), fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("rechaza sobre un assignment en borrador", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccionSobreAssignment(fakeAlumno("c1"), fakeAssignmentBorrador("c1"))
    ).toThrow(AssignmentNoDisponibleError);
  });

  it("prioriza el rechazo por comisión sobre el de estado", () => {
    expect(() =>
      ESTUDIANTE.autorizarAccionSobreAssignment(fakeAlumno("c2"), fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

describe("Docente.autorizarAccionSobreAssignment", () => {
  it("permite actuar sobre un assignment en borrador", () => {
    expect(() =>
      DOCENTE.autorizarAccionSobreAssignment(null, fakeAssignmentBorrador("c1"))
    ).not.toThrow();
  });
});

describe("puedeAdministrar", () => {
  it("Docente tiene alcance administrativo", () => {
    expect(DOCENTE.puedeAdministrar()).toBe(true);
  });

  it("Estudiante no tiene alcance administrativo", () => {
    expect(ESTUDIANTE.puedeAdministrar()).toBe(false);
  });
});

describe("navegación por rol", () => {
  it("Docente ve las secciones de admin", () => {
    const items = DOCENTE.itemsDeNavegacion();
    expect(items.map((item) => item.href)).toEqual([
      "/admin/assignments",
      "/admin/grupos",
      "/admin/comisiones",
      "/admin/alumnos",
      "/admin/operaciones",
    ]);
  });

  it("Estudiante no ve ninguna sección de admin", () => {
    expect(ESTUDIANTE.itemsDeNavegacion()).toEqual([]);
  });

  it("solo el Estudiante ve el banner de sincronización", () => {
    expect(ESTUDIANTE.veBannerDeSincronizacion()).toBe(true);
    expect(DOCENTE.veBannerDeSincronizacion()).toBe(false);
  });
});

describe("Estudiante.autorizarCambioDeMembresia", () => {
  it("autoriza con inscripciones abiertas y sin entrega", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).not.toThrow();
  });

  it("rechaza con InscripcionesCerradasError cuando el docente cerró las inscripciones", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(InscripcionesCerradasError);
  });

  it("rechaza con InscripcionesCerradasError cuando el assignment no está publicado", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.maxIntegrantes = 3;
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: grupal,
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(InscripcionesCerradasError);
  });

  it("rechaza con GrupoConEntregaError cuando el grupo ya entregó", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(GrupoConEntregaError);
  });

  it("prioriza inscripciones cerradas sobre grupo con entrega", () => {
    expect(() =>
      ESTUDIANTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(InscripcionesCerradasError);
  });
});

describe("Docente.autorizarCambioDeMembresia", () => {
  it("autoriza siempre, incluso con inscripciones cerradas y grupo con entrega", () => {
    expect(() =>
      DOCENTE.autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).not.toThrow();
  });
});

describe("origenDeAuditoria", () => {
  it("Estudiante se audita como 'alumno'", () => {
    expect(ESTUDIANTE.origenDeAuditoria()).toBe("alumno");
  });

  it("Docente se audita como 'docente'", () => {
    expect(DOCENTE.origenDeAuditoria()).toBe("docente");
  });
});

describe("motivoDeBloqueoDeMembresia", () => {
  it("devuelve null cuando el cambio está autorizado", () => {
    expect(
      ESTUDIANTE.motivoDeBloqueoDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toBeNull();
  });

  it("devuelve el mensaje del error que el servidor tiraría", () => {
    const contexto = {
      assignment: fakeGrupal(),
      grupo: fakeGrupo(),
      grupoTieneEntrega: true,
    };
    const motivo = ESTUDIANTE.motivoDeBloqueoDeMembresia(contexto);
    const error = new GrupoConEntregaError("g1");
    expect(motivo).toBe(error.message);
  });

  it("nunca bloquea al Docente", () => {
    expect(
      DOCENTE.motivoDeBloqueoDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toBeNull();
  });

  it("también traduce InscripcionesCerradasError a motivo", () => {
    const contexto = {
      assignment: fakeGrupal({ inscripcionesCerradas: true }),
      grupo: fakeGrupo(),
      grupoTieneEntrega: false,
    };
    const motivo = ESTUDIANTE.motivoDeBloqueoDeMembresia(contexto);
    const error = new InscripcionesCerradasError(contexto.assignment.id);
    expect(motivo).toBe(error.message);
  });

  it("relanza un error inesperado en vez de mostrarlo como bloqueo", () => {
    const rolConBug = Object.create(ESTUDIANTE) as typeof ESTUDIANTE;
    rolConBug.autorizarCambioDeMembresia = () => {
      throw new TypeError("contexto mal armado");
    };

    expect(() =>
      rolConBug.motivoDeBloqueoDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(TypeError);
  });
});

describe("resolverRol", () => {
  it("devuelve DOCENTE si el username está en la lista de admins", () => {
    expect(resolverRol("juancete", ["juancete"])).toBe(DOCENTE);
  });

  it("es case-insensitive contra la lista de admins", () => {
    expect(resolverRol("JuanCete", ["juancete"])).toBe(DOCENTE);
  });

  it("devuelve ESTUDIANTE si el username no está en la lista", () => {
    expect(resolverRol("ana", ["juancete"])).toBe(ESTUDIANTE);
  });

  it("devuelve ESTUDIANTE con lista de admins vacía", () => {
    expect(resolverRol("ana", [])).toBe(ESTUDIANTE);
  });

  it("normaliza mayúsculas de la propia lista de admins, sin depender del caller", () => {
    expect(resolverRol("juancete", ["JuanCete"])).toBe(DOCENTE);
  });
});

describe("DOCENTE y ESTUDIANTE son instancias de RolDeUsuario", () => {
  it("son singletons reutilizados", () => {
    expect(DOCENTE).toBeInstanceOf(RolDeUsuario);
    expect(ESTUDIANTE).toBeInstanceOf(RolDeUsuario);
    expect(resolverRol("x", [])).toBe(ESTUDIANTE);
    expect(resolverRol("x", [])).toBe(resolverRol("y", []));
  });
});
