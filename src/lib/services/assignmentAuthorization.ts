import {
  AssignmentNoEncontradoError,
  AssignmentNoDisponibleError,
  GrupoNoEncontradoError,
  AccesoAssignmentProhibidoError,
  type Alumno,
  type Assignment,
  type RolDeUsuario,
} from "@/domain/entities";

// Reexportados desde el dominio: son errores sobre la existencia/disponibilidad
// de assignments y grupos, o veredictos de autorización de rol — los
// repositorios y el propio `RolDeUsuario` los lanzan directamente y no
// deberían importar hacia arriba desde `@/lib/services`. Se reexportan acá
// para no romper los imports existentes de este módulo.
export {
  AssignmentNoEncontradoError,
  AssignmentNoDisponibleError,
  GrupoNoEncontradoError,
  AccesoAssignmentProhibidoError,
};

/**
 * Política única de acceso académico a un assignment. Delega en el rol del
 * usuario (`RolDeUsuario`): el docente tiene alcance global, el alumno
 * necesita coincidir en comisión con el assignment. Se mantiene esta función
 * como fachada porque el resto del código ya la conoce por nombre — el
 * comportamiento vive en `RolDeUsuario`, no acá.
 */
export function autorizarAccesoAssignment(
  user: { rol: RolDeUsuario },
  alumno: Alumno | null,
  assignment: Assignment
): void {
  user.rol.autorizarAccesoAssignment(alumno, assignment);
}

/**
 * Acceso académico más habilitación por estado: además de pertenecer a la
 * comisión, el assignment tiene que estar en un estado que permita que un
 * alumno actúe sobre él (aceptar, crear grupo, unirse a un grupo). El rol
 * docente conserva el alcance global — puede operar sobre un borrador para
 * probar el flujo antes de publicar.
 */
export function autorizarAccionSobreAssignment(
  user: { rol: RolDeUsuario },
  alumno: Alumno | null,
  assignment: Assignment
): void {
  user.rol.autorizarAccionSobreAssignment(alumno, assignment);
}
