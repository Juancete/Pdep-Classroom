import type { Alumno, Assignment } from "@/domain/entities";

export class AssignmentNoEncontradoError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Assignment no encontrado");
    this.name = "AssignmentNoEncontradoError";
  }
}

export class AccesoAssignmentProhibidoError extends Error {
  constructor(public readonly assignmentId: string) {
    super("No tenés acceso a este assignment");
    this.name = "AccesoAssignmentProhibidoError";
  }
}

export class GrupoNoEncontradoError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly grupoId: string
  ) {
    super("Grupo no encontrado");
    this.name = "GrupoNoEncontradoError";
  }
}

export class AssignmentNoDisponibleError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Este TP no está disponible.");
    this.name = "AssignmentNoDisponibleError";
  }
}

/**
 * Política única de acceso académico a un assignment.
 *
 * Los administradores tienen alcance global. Para el resto, tanto el alumno
 * como el assignment deben tener una comisión y ambas deben coincidir.
 */
export function autorizarAccesoAssignment(
  user: { isAdmin: boolean },
  alumno: Alumno | null,
  assignment: Assignment
): void {
  if (user.isAdmin) return;

  if (
    !alumno ||
    !assignment.comision ||
    alumno.comision?.id !== assignment.comision.id
  ) {
    throw new AccesoAssignmentProhibidoError(assignment.id);
  }
}

/**
 * Acceso académico más habilitación por estado: además de pertenecer a la
 * comisión, el assignment tiene que estar en un estado que permita que un
 * alumno actúe sobre él (aceptar, crear grupo, unirse a un grupo). Los
 * administradores conservan el alcance global de `autorizarAccesoAssignment`
 * — pueden operar sobre un borrador para probar el flujo antes de publicar.
 */
export function autorizarAccionSobreAssignment(
  user: { isAdmin: boolean },
  alumno: Alumno | null,
  assignment: Assignment
): void {
  autorizarAccesoAssignment(user, alumno, assignment);
  if (user.isAdmin) return;

  if (!assignment.permiteAccionesDeAlumno()) {
    throw new AssignmentNoDisponibleError(assignment.id);
  }
}
