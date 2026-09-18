import { describe, it, expect } from "vitest";
import {
  Participante,
  ParticipanteAlumno,
  ParticipanteDocente,
  AccesoAssignmentProhibidoError,
} from "./Participante";
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

function participanteAlumno(comisionId = "c1"): ParticipanteAlumno {
  return new ParticipanteAlumno(fakeAlumno(comisionId), "ana");
}

function participanteDocente(comisionActivaId: string | null = "c1"): ParticipanteDocente {
  return new ParticipanteDocente(
    "profe-docente",
    comisionActivaId ? fakeComision(comisionActivaId) : null
  );
}

describe("ParticipanteAlumno.autorizarAccesoAssignment", () => {
  it("permite al alumno de la misma comisión", () => {
    expect(() =>
      participanteAlumno("c1").autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("rechaza al alumno de otra comisión", () => {
    expect(() =>
      participanteAlumno("c2").autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza sin alumno registrado", () => {
    const participante = new ParticipanteAlumno(null, "forastero");
    expect(() =>
      participante.autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza assignments históricos sin comisión", () => {
    expect(() =>
      participanteAlumno("c1").autorizarAccesoAssignment(fakeAssignmentPublicado(null))
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

describe("ParticipanteDocente.autorizarAccesoAssignment", () => {
  it("permite acceso cuando la comisión activa coincide con la del assignment", () => {
    expect(() =>
      participanteDocente("c1").autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("rechaza sin comisión activa (a diferencia del bypass administrativo del rol)", () => {
    expect(() =>
      participanteDocente(null).autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza cuando la comisión activa no coincide con la del assignment", () => {
    expect(() =>
      participanteDocente("c2").autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

describe("Participante.autorizarAccionSobreAssignment", () => {
  it("alumno: permite sobre un assignment publicado de la comisión", () => {
    expect(() =>
      participanteAlumno("c1").autorizarAccionSobreAssignment(fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("alumno: rechaza sobre un assignment en borrador", () => {
    expect(() =>
      participanteAlumno("c1").autorizarAccionSobreAssignment(fakeAssignmentBorrador("c1"))
    ).toThrow(AssignmentNoDisponibleError);
  });

  it("alumno: prioriza el rechazo por comisión sobre el de estado", () => {
    expect(() =>
      participanteAlumno("c2").autorizarAccionSobreAssignment(fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  // issue #107/#112: ya no hay bypass de estado para el docente en Mis TPs —
  // sigue exactamente las mismas reglas que un alumno.
  it("docente: acepta sobre un publicado de la comisión activa", () => {
    expect(() =>
      participanteDocente("c1").autorizarAccionSobreAssignment(fakeAssignmentPublicado("c1"))
    ).not.toThrow();
  });

  it("docente: no acepta un borrador", () => {
    expect(() =>
      participanteDocente("c1").autorizarAccionSobreAssignment(fakeAssignmentBorrador("c1"))
    ).toThrow(AssignmentNoDisponibleError);
  });

  it("docente: rechaza fuera de la comisión activa", () => {
    expect(() =>
      participanteDocente("c2").autorizarAccionSobreAssignment(fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

// Reglas idénticas para alumno y docente — antes sólo las tenía
// `RolEstudiante`, el docente resolvía siempre (bypass administrativo).
describe.each([
  ["alumno", () => participanteAlumno() as Participante],
  ["docente", () => participanteDocente() as Participante],
] as const)("%s.autorizarCambioDeMembresia", (_nombre, crearParticipante) => {
  it("autoriza con inscripciones abiertas y sin entrega", () => {
    expect(() =>
      crearParticipante().autorizarCambioDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).not.toThrow();
  });

  it("rechaza con InscripcionesCerradasError cuando el docente cerró las inscripciones", () => {
    expect(() =>
      crearParticipante().autorizarCambioDeMembresia({
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
      crearParticipante().autorizarCambioDeMembresia({
        assignment: grupal,
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(InscripcionesCerradasError);
  });

  it("rechaza con GrupoConEntregaError cuando el grupo ya aceptó el TP", () => {
    expect(() =>
      crearParticipante().autorizarCambioDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(GrupoConEntregaError);
  });

  it("prioriza inscripciones cerradas sobre grupo con entrega", () => {
    expect(() =>
      crearParticipante().autorizarCambioDeMembresia({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(InscripcionesCerradasError);
  });
});

describe("origenDeAuditoria", () => {
  it("ParticipanteAlumno se audita como 'alumno'", () => {
    expect(participanteAlumno().origenDeAuditoria()).toBe("alumno");
  });

  it("ParticipanteDocente se audita como 'docente'", () => {
    expect(participanteDocente().origenDeAuditoria()).toBe("docente");
  });
});

describe("tipoDeGrupo", () => {
  it("ParticipanteAlumno integra grupos de alumnos", () => {
    expect(participanteAlumno().tipoDeGrupo()).toBe("alumnos");
  });

  it("ParticipanteDocente integra grupos de docentes", () => {
    expect(participanteDocente().tipoDeGrupo()).toBe("docentes");
  });
});

describe("alumnoId", () => {
  it("devuelve el id del alumno vinculado", () => {
    expect(participanteAlumno().alumnoId()).toBe("alumno-1");
  });

  it("devuelve undefined si el alumno no está registrado", () => {
    expect(new ParticipanteAlumno(null, "forastero").alumnoId()).toBeUndefined();
  });

  it("un docente nunca tiene alumnoId (nunca tiene fila en Alumno)", () => {
    expect(participanteDocente().alumnoId()).toBeUndefined();
  });
});

describe("necesitaRegistro", () => {
  it("ParticipanteAlumno: false si no hay comisión activa", () => {
    expect(participanteAlumno().necesitaRegistro(null)).toBe(false);
  });

  it("ParticipanteAlumno: true si no está registrado y hay comisión activa", () => {
    const participante = new ParticipanteAlumno(null, "forastero");
    expect(participante.necesitaRegistro(fakeComision("c1"))).toBe(true);
  });

  it("ParticipanteAlumno: true si confirmó en otra comisión", () => {
    const alumno = fakeAlumno("c1");
    alumno.confirmarRegistroEn(fakeComision("c2"));
    const participante = new ParticipanteAlumno(alumno, alumno.githubUsername);
    expect(participante.necesitaRegistro(fakeComision("c1"))).toBe(true);
  });

  it("ParticipanteAlumno: false si confirmó en la comisión activa", () => {
    const alumno = fakeAlumno("c1");
    const comisionActiva = fakeComision("c1");
    alumno.confirmarRegistroEn(comisionActiva);
    const participante = new ParticipanteAlumno(alumno, alumno.githubUsername);
    expect(participante.necesitaRegistro(comisionActiva)).toBe(false);
  });

  it("ParticipanteDocente: nunca necesita registro", () => {
    expect(participanteDocente().necesitaRegistro(fakeComision("c1"))).toBe(false);
    expect(participanteDocente().necesitaRegistro(null)).toBe(false);
  });
});

describe("motivoDeBloqueoDeMembresia", () => {
  it("devuelve null cuando el cambio está autorizado", () => {
    expect(
      participanteAlumno().motivoDeBloqueoDeMembresia({
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
    const motivo = participanteAlumno().motivoDeBloqueoDeMembresia(contexto);
    const error = new GrupoConEntregaError("g1");
    expect(motivo).toBe(error.message);
  });

  it("también traduce InscripcionesCerradasError a motivo", () => {
    const contexto = {
      assignment: fakeGrupal({ inscripcionesCerradas: true }),
      grupo: fakeGrupo(),
      grupoTieneEntrega: false,
    };
    const motivo = participanteAlumno().motivoDeBloqueoDeMembresia(contexto);
    const error = new InscripcionesCerradasError(contexto.assignment.id);
    expect(motivo).toBe(error.message);
  });

  it("bloquea al docente igual que a un alumno (mismas reglas de membresía)", () => {
    const contexto = {
      assignment: fakeGrupal({ inscripcionesCerradas: true }),
      grupo: fakeGrupo(),
      grupoTieneEntrega: true,
    };
    expect(participanteDocente().motivoDeBloqueoDeMembresia(contexto)).not.toBeNull();
  });

  it("relanza un error inesperado en vez de mostrarlo como bloqueo", () => {
    const participante = participanteAlumno();
    participante.autorizarCambioDeMembresia = () => {
      throw new TypeError("contexto mal armado");
    };

    expect(() =>
      participante.motivoDeBloqueoDeMembresia({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(TypeError);
  });
});
