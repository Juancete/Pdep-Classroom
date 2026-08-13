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
