import { Alumno } from "./Alumno";
import type { Assignment } from "./Assignment";
import { AssignmentNoDisponibleError } from "./Assignment";
import type { Comision } from "./Comision";
import type { GrupalAssignment } from "./GrupalAssignment";
import type { Grupo } from "./Grupo";
import { InscripcionesCerradasError, GrupoConEntregaError } from "./Grupo";
import type { TipoDeIntegrantes } from "@/types";

// Lanzado cuando un participante intenta acceder a un assignment fuera de su
// comisión (o sin poder participar en absoluto). El handler HTTP lo traduce
// a 403. Vivía en `RolDeUsuario.ts` — se muda acá porque la autorización
// académica pasó a ser responsabilidad de `Participante`, no del rol.
export class AccesoAssignmentProhibidoError extends Error {
  constructor(public readonly assignmentId: string) {
    super("No tenés acceso a este assignment");
    this.name = "AccesoAssignmentProhibidoError";
  }
}

export type OrigenCambioMembresia = "alumno" | "docente";

/** Contexto que necesita evaluar una autorización de cambio de membresía. */
export interface ContextoDeMembresia {
  assignment: GrupalAssignment;
  grupo: Grupo;
  grupoTieneEntrega: boolean;
}

/**
 * Quien puede autorizar un cambio de membresía y a nombre de quién queda
 * auditado. La implementa `Participante` (actuando sobre sí mismo) y el
 * objeto que devuelve `RolDeUsuario.actorSobreMembresiaAjena()` (un docente
 * administrando la membresía de otro). Permite que `GrupoRepository` reciba
 * un único tipo en `salirDeGrupo`/`moverAlumnoDeGrupo`, sin necesitar saber
 * si quien actúa es el propio interesado o un tercero administrando.
 */
export interface ActorDeMembresia {
  autorizarCambioDeMembresia(contexto: ContextoDeMembresia): void;
  origenDeAuditoria(): OrigenCambioMembresia;
}

/**
 * Quién participa en los flujos self-service de Mis TPs (aceptar, crear/
 * unirse/salir/cambiarse de grupo sobre sí mismo). Dos implementaciones —
 * `ParticipanteAlumno` y `ParticipanteDocente` — con reglas de participación
 * **idénticas** entre sí: antes esas reglas vivían sólo en `RolEstudiante` y
 * dependían de qué rol tenía el usuario; ahora son las mismas para cualquier
 * participante, sin importar el rol. Lo único que varía entre ambas
 * implementaciones es de qué comisión participa, qué tipo de grupo integra
 * y su vínculo (opcional) con `Alumno`.
 *
 * Reemplaza la autorización académica que vivía en `RolDeUsuario`
 * (`autorizarAccesoAssignment`, `autorizarAccionSobreAssignment`,
 * `autorizarCambioDeMembresia`, `origenDeAuditoria`, `motivoDeBloqueoDeMembresia`):
 * ese comportamiento dependía de "con qué comisión participa este usuario",
 * no de si administra el sistema — separarlo aclara que un docente en Mis
 * TPs sigue exactamente las mismas reglas que un alumno, mientras que
 * `RolDeUsuario` sigue resolviendo el alcance administrativo (issue #107/#112).
 */
export abstract class Participante implements ActorDeMembresia {
  readonly githubUsername: string;

  constructor(githubUsername: string) {
    // Canónico siempre: los callers (repos, rutas) comparan/persisten este
    // valor tal cual, sin tener que normalizarlo de nuevo en cada punto.
    this.githubUsername = Alumno.normalizarUsername(githubUsername);
  }

  /** Vínculo con `Alumno`, si existe — lo usan la entrega, el miembro de grupo y la auditoría. */
  abstract get alumno(): Alumno | null;

  /** Tipo de grupo que este participante integra ("alumnos" o "docentes"). */
  abstract tipoDeGrupo(): TipoDeIntegrantes;

  /** Valor a persistir en la auditoría de membresías: quién originó el cambio. */
  abstract origenDeAuditoria(): OrigenCambioMembresia;

  /** `true` si Mis TPs debe redirigir a `/registro` antes de dejarlo continuar. */
  abstract necesitaRegistro(comisionActiva: Comision | null): boolean;

  /** Comisión desde la que participa — `null` significa que no tiene acceso a ningún assignment. */
  protected abstract comisionDeParticipacion(): Comision | null;

  /**
   * Autoriza el acceso de lectura a un assignment: exige que este
   * participante tenga comisión y coincida con la del assignment. Lanza
   * `AccesoAssignmentProhibidoError` si no — misma regla para alumno y
   * docente, la única diferencia es de qué comisión participa cada uno.
   */
  autorizarAccesoAssignment(assignment: Assignment): void {
    const comision = this.comisionDeParticipacion();
    if (!comision || !assignment.comision || comision.id !== assignment.comision.id) {
      throw new AccesoAssignmentProhibidoError(assignment.id);
    }
  }

  /**
   * Acceso + habilitación por estado: además de pertenecer a la comisión, el
   * assignment tiene que estar en un estado que permita actuar (aceptar,
   * crear grupo, unirse). Ya no hay bypass de estado para el docente: en Mis
   * TPs sigue las mismas reglas que un alumno (issue #107/#112) — el alcance
   * administrativo global sigue vivo en `RolDeUsuario`, para las acciones
   * *sobre otros*.
   */
  autorizarAccionSobreAssignment(assignment: Assignment): void {
    this.autorizarAccesoAssignment(assignment);
    if (!assignment.permiteAccionesDeAlumno()) {
      throw new AssignmentNoDisponibleError(assignment.id);
    }
  }

  /**
   * Autoriza que este participante modifique la composición de un grupo
   * (crear, unirse, salir, cambiarse) sobre sí mismo: exige inscripciones
   * abiertas y que el grupo no tenga entrega todavía. Idéntica para alumno y
   * docente — antes sólo la tenía `RolEstudiante`, el docente resolvía
   * siempre (bypass administrativo). Ese bypass sigue existiendo, pero sólo
   * para administrar la membresía de *otros* (`RolDeUsuario.actorSobreMembresiaAjena`).
   */
  autorizarCambioDeMembresia({ assignment, grupo, grupoTieneEntrega }: ContextoDeMembresia): void {
    if (!assignment.aceptaNuevasInscripciones()) {
      throw new InscripcionesCerradasError(assignment.id);
    }
    if (grupoTieneEntrega) {
      throw new GrupoConEntregaError(grupo.id);
    }
  }

  /**
   * Sondea `autorizarCambioDeMembresia` sin ejecutarla: devuelve el motivo
   * del bloqueo, o `null` si el cambio está permitido. Mismo idioma que
   * `transicionesDisponibles` para el ciclo de vida de un assignment — la UI
   * y el servidor no pueden divergir, porque el texto que ve el participante
   * ES el `message` del error que el servidor tiraría si igual manda el
   * request.
   */
  motivoDeBloqueoDeMembresia(contexto: ContextoDeMembresia): string | null {
    try {
      this.autorizarCambioDeMembresia(contexto);
      return null;
    } catch (error) {
      // Sólo los errores de dominio que `autorizarCambioDeMembresia` puede
      // lanzar se traducen a motivo de bloqueo. Cualquier otra falla (un
      // `TypeError` por un contexto mal armado, por ejemplo) es un bug real
      // que tiene que romper fuerte, no disfrazarse de "grupo bloqueado".
      if (
        error instanceof InscripcionesCerradasError ||
        error instanceof GrupoConEntregaError
      ) {
        return error.message;
      }
      throw error;
    }
  }

  /** Id de `Alumno` para auditoría/entrega, o `undefined` si no tiene vínculo. */
  alumnoId(): string | undefined {
    return this.alumno?.id;
  }
}

/**
 * Un alumno participando desde Mis TPs — el caso de siempre. `alumno` puede
 * ser `null` (todavía no se registró): en ese caso no tiene comisión, así
 * que `autorizarAccesoAssignment` rechaza cualquier assignment.
 */
export class ParticipanteAlumno extends Participante {
  constructor(
    private readonly alumnoRegistrado: Alumno | null,
    githubUsername: string
  ) {
    super(githubUsername);
  }

  get alumno(): Alumno | null {
    return this.alumnoRegistrado;
  }

  tipoDeGrupo(): TipoDeIntegrantes {
    return "alumnos";
  }

  origenDeAuditoria(): OrigenCambioMembresia {
    return "alumno";
  }

  necesitaRegistro(comisionActiva: Comision | null): boolean {
    return (
      comisionActiva !== null &&
      (!this.alumnoRegistrado ||
        this.alumnoRegistrado.necesitaConfirmarRegistroPara(comisionActiva))
    );
  }

  protected comisionDeParticipacion(): Comision | null {
    return this.alumnoRegistrado?.comision ?? null;
  }
}

/**
 * Un docente participando desde Mis TPs — la demo de aceptación (issue
 * #107/#112). Nunca tiene fila en `Alumno` (`alumno` siempre `null`): no se
 * registra, no pasa por `/registro`, no toca la planilla ni los canales.
 * Participa desde la comisión activa (no la suya, porque no tiene una) —
 * si no hay comisión activa, no tiene acceso a ningún assignment.
 */
export class ParticipanteDocente extends Participante {
  constructor(
    githubUsername: string,
    private readonly comisionActiva: Comision | null
  ) {
    super(githubUsername);
  }

  get alumno(): null {
    return null;
  }

  tipoDeGrupo(): TipoDeIntegrantes {
    return "docentes";
  }

  origenDeAuditoria(): OrigenCambioMembresia {
    return "docente";
  }

  necesitaRegistro(_comisionActiva: Comision | null): boolean {
    return false;
  }

  protected comisionDeParticipacion(): Comision | null {
    return this.comisionActiva;
  }
}
