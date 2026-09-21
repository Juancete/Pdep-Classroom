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

// Registro confirmado en la misma comisión por defecto (issue #107, revisión
// de code review): `ParticipanteAlumno` sólo participa con el registro
// confirmado, no alcanza con tener `comision` asignada. Los tests que
// ejercitan específicamente esa regla (`describe("comisionDeParticipacion
// exige registro confirmado")`) pisan `registroConfirmadoEn` a mano.
function fakeAlumno(comisionId = "c1"): Alumno {
  const comision = fakeComision(comisionId);
  return Object.assign(new Alumno(), {
    id: "alumno-1",
    githubUsername: "ana",
    comision,
    registroConfirmadoEn: comision,
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

// Issue #107, revisión de code review: tener `comision` asignada no alcanza
// — la UI manda a `/registro` justamente para esto, así que la API tiene
// que exigir lo mismo, o un alumno importado sin confirmar podría actuar
// igual que uno confirmado.
describe("ParticipanteAlumno exige registro confirmado", () => {
  it("un alumno con comisión pero sin registro confirmado no tiene acceso al assignment", () => {
    const alumno = Object.assign(new Alumno(), {
      id: "alumno-1",
      githubUsername: "ana",
      comision: fakeComision("c1"),
      registroConfirmadoEn: undefined,
    });
    const participante = new ParticipanteAlumno(alumno, alumno.githubUsername);

    expect(() =>
      participante.autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("un alumno confirmado en otra comisión distinta a la de su fila no tiene acceso", () => {
    const comisionVieja = fakeComision("c-vieja");
    const comisionNueva = fakeComision("c1");
    const alumno = Object.assign(new Alumno(), {
      id: "alumno-1",
      githubUsername: "ana",
      comision: comisionNueva,
      registroConfirmadoEn: comisionVieja,
    });
    const participante = new ParticipanteAlumno(alumno, alumno.githubUsername);

    expect(() =>
      participante.autorizarAccesoAssignment(fakeAssignmentPublicado("c1"))
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
] as const)("%s.autorizarAltaEnGrupo", (_nombre, crearParticipante) => {
  it("permite sumarse a un grupo que ya aceptó el TP", () => {
    // El contexto de alta no lleva `grupoTieneEntrega`: la entrega del grupo
    // no interviene en el alta (issue #123).
    expect(() =>
      crearParticipante().autorizarAltaEnGrupo({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
      })
    ).not.toThrow();
  });

  it("rechaza el alta con las inscripciones cerradas", () => {
    expect(() =>
      crearParticipante().autorizarAltaEnGrupo({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
      })
    ).toThrow(InscripcionesCerradasError);
  });

  it("rechaza con InscripcionesCerradasError cuando el assignment no está publicado", () => {
    const grupal = new GrupalAssignment();
    grupal.id = "a1";
    grupal.maxIntegrantes = 3;
    // Comisión igual a la del participante (issue #107, revisión de code
    // review): el alta exige acceso al assignment antes de mirar el estado —
    // sin esto, este fixture sin comisión rechazaría antes por
    // `AccesoAssignmentProhibidoError`, no por las inscripciones cerradas.
    grupal.comision = fakeComision();
    expect(() =>
      crearParticipante().autorizarAltaEnGrupo({ assignment: grupal, grupo: fakeGrupo() })
    ).toThrow(InscripcionesCerradasError);
  });
});

describe("autorizarAltaEnGrupo", () => {
  it("rechaza el alta de un participante de otra comisión", () => {
    expect(() =>
      participanteAlumno("c2").autorizarAltaEnGrupo({
        assignment: fakeGrupal(), // comisión "c1"
        grupo: fakeGrupo(),
      })
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza el alta de un alumno sin registro", () => {
    const participante = new ParticipanteAlumno(null, "forastero");
    expect(() =>
      participante.autorizarAltaEnGrupo({ assignment: fakeGrupal(), grupo: fakeGrupo() })
    ).toThrow(AccesoAssignmentProhibidoError);
  });
});

describe.each([
  ["alumno", () => participanteAlumno() as Participante],
  ["docente", () => participanteDocente() as Participante],
] as const)("%s.autorizarBajaDeGrupo", (_nombre, crearParticipante) => {
  it("permite la baja cuando el grupo todavía no aceptó el TP", () => {
    expect(() =>
      crearParticipante().autorizarBajaDeGrupo({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).not.toThrow();
  });

  it("sigue bloqueando la salida de un grupo que ya aceptó el TP", () => {
    expect(() =>
      crearParticipante().autorizarBajaDeGrupo({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(GrupoConEntregaError);
  });

  it("rechaza con InscripcionesCerradasError cuando el docente cerró las inscripciones", () => {
    expect(() =>
      crearParticipante().autorizarBajaDeGrupo({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(InscripcionesCerradasError);
  });

  it("prioriza inscripciones cerradas sobre grupo con entrega", () => {
    expect(() =>
      crearParticipante().autorizarBajaDeGrupo({
        assignment: fakeGrupal({ inscripcionesCerradas: true }),
        grupo: fakeGrupo(),
        grupoTieneEntrega: true,
      })
    ).toThrow(InscripcionesCerradasError);
  });
});

// Revisión de code review (issue #107/#112): antes la autorización no
// chequeaba acceso al assignment en self-service — `salirDeGrupo` podía dejar
// salir a alguien sin acceso real al assignment.
describe("autorizarBajaDeGrupo exige acceso al assignment", () => {
  it("rechaza a un alumno de otra comisión con AccesoAssignmentProhibidoError", () => {
    expect(() =>
      participanteAlumno("c2").autorizarBajaDeGrupo({
        assignment: fakeGrupal(), // comisión "c1"
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(AccesoAssignmentProhibidoError);
  });

  it("rechaza a un alumno sin registro", () => {
    const participante = new ParticipanteAlumno(null, "forastero");
    expect(() =>
      participante.autorizarBajaDeGrupo({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(AccesoAssignmentProhibidoError);
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

describe("motivoDeBloqueoDeBaja", () => {
  it("devuelve null cuando el cambio está autorizado", () => {
    expect(
      participanteAlumno().motivoDeBloqueoDeBaja({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toBeNull();
  });

  it("devuelve null cuando el grupo todavía no aceptó el TP", () => {
    expect(
      participanteDocente().motivoDeBloqueoDeBaja({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toBeNull();
  });

  it("devuelve el mensaje de GrupoConEntregaError cuando el grupo ya aceptó el TP", () => {
    const contexto = {
      assignment: fakeGrupal(),
      grupo: fakeGrupo(),
      grupoTieneEntrega: true,
    };
    const motivo = participanteAlumno().motivoDeBloqueoDeBaja(contexto);
    const error = new GrupoConEntregaError("g1");
    expect(motivo).toBe(error.message);
  });

  it("también traduce InscripcionesCerradasError a motivo", () => {
    const contexto = {
      assignment: fakeGrupal({ inscripcionesCerradas: true }),
      grupo: fakeGrupo(),
      grupoTieneEntrega: false,
    };
    const motivo = participanteAlumno().motivoDeBloqueoDeBaja(contexto);
    const error = new InscripcionesCerradasError(contexto.assignment.id);
    expect(motivo).toBe(error.message);
  });

  it("devuelve el motivo de acceso prohibido en vez de lanzar", () => {
    const contexto = {
      assignment: fakeGrupal(), // comisión "c1"
      grupo: fakeGrupo(),
      grupoTieneEntrega: false,
    };
    const motivo = participanteAlumno("c2").motivoDeBloqueoDeBaja(contexto);
    const error = new AccesoAssignmentProhibidoError(contexto.assignment.id);
    expect(motivo).toBe(error.message);
  });

  it("bloquea al docente igual que a un alumno (mismas reglas de membresía)", () => {
    const contexto = {
      assignment: fakeGrupal({ inscripcionesCerradas: true }),
      grupo: fakeGrupo(),
      grupoTieneEntrega: true,
    };
    expect(participanteDocente().motivoDeBloqueoDeBaja(contexto)).not.toBeNull();
  });

  it("relanza un error inesperado en vez de mostrarlo como bloqueo", () => {
    const participante = participanteAlumno();
    participante.autorizarBajaDeGrupo = () => {
      throw new TypeError("contexto mal armado");
    };

    expect(() =>
      participante.motivoDeBloqueoDeBaja({
        assignment: fakeGrupal(),
        grupo: fakeGrupo(),
        grupoTieneEntrega: false,
      })
    ).toThrow(TypeError);
  });
});
