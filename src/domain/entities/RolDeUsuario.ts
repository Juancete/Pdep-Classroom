import type { Alumno } from "./Alumno";
import type { Assignment } from "./Assignment";
import { AssignmentNoDisponibleError } from "./Assignment";

// Lanzado cuando un alumno intenta acceder a un assignment fuera de su
// comisión (o sin estar registrado). El handler HTTP lo traduce a 403.
// Vive acá — junto al rol que lo lanza — y no en la capa de servicios, mismo
// criterio que el resto de los errores de dominio movidos en b986ea4.
export class AccesoAssignmentProhibidoError extends Error {
  constructor(public readonly assignmentId: string) {
    super("No tenés acceso a este assignment");
    this.name = "AccesoAssignmentProhibidoError";
  }
}

export type ItemDeNavegacion = { href: string; label: string };

/**
 * Rol de un usuario dentro del sistema, modelado como Strategy en vez de un
 * booleano (`isAdmin`) chequeado en 40+ lugares: cada decisión que dependía
 * de "es admin o no" (autorización de acceso, alcance de las queries, qué
 * navegación mostrar) se delega al objeto concreto. Mismo criterio que
 * `EstadoAssignment` para el ciclo de vida de un assignment.
 *
 * Instancias singleton — el rol no tiene datos propios, solo comportamiento.
 */
export abstract class RolDeUsuario {
  /**
   * Autoriza el acceso de lectura a un assignment. Docente: alcance global,
   * siempre pasa. Alumno: exige que tenga comisión y coincida con la del
   * assignment. Lanza `AccesoAssignmentProhibidoError` si no.
   */
  abstract autorizarAccesoAssignment(alumno: Alumno | null, assignment: Assignment): void;

  /**
   * Acceso + habilitación por estado: además de `autorizarAccesoAssignment`,
   * exige que el assignment esté en un estado que permita actuar (aceptar,
   * crear grupo, unirse). Docente conserva el alcance global — puede operar
   * sobre un borrador para probar el flujo antes de publicar.
   */
  abstract autorizarAccionSobreAssignment(alumno: Alumno | null, assignment: Assignment): void;

  /**
   * `true` si este rol tiene alcance administrativo global (ve todo el
   * padrón, todas las comisiones, bypassea el estado de un assignment).
   * Un único predicado reusado donde antes se preguntaba `isAdmin` para
   * decidir qué datos traer, no una regla de negocio nueva por sitio.
   */
  abstract puedeAdministrar(): boolean;

  /** Secciones de `/admin/*` que este rol ve en la navegación. */
  abstract itemsDeNavegacion(): ItemDeNavegacion[];

  /** `true` si este rol debe ver el banner de sincronización pendiente. */
  abstract veBannerDeSincronizacion(): boolean;
}

class Docente extends RolDeUsuario {
  autorizarAccesoAssignment(): void {
    // Alcance global: el docente accede a cualquier assignment.
  }

  autorizarAccionSobreAssignment(): void {
    // Idem — incluso sobre un borrador, para poder probar el flujo.
  }

  puedeAdministrar(): boolean {
    return true;
  }

  itemsDeNavegacion(): ItemDeNavegacion[] {
    return [
      { href: "/admin/assignments", label: "Assignments" },
      { href: "/admin/grupos", label: "Grupos" },
      { href: "/admin/comisiones", label: "Comisiones" },
      { href: "/admin/alumnos", label: "Alumnos" },
    ];
  }

  veBannerDeSincronizacion(): boolean {
    return false;
  }
}

class Estudiante extends RolDeUsuario {
  autorizarAccesoAssignment(alumno: Alumno | null, assignment: Assignment): void {
    if (
      !alumno ||
      !assignment.comision ||
      alumno.comision?.id !== assignment.comision.id
    ) {
      throw new AccesoAssignmentProhibidoError(assignment.id);
    }
  }

  autorizarAccionSobreAssignment(alumno: Alumno | null, assignment: Assignment): void {
    this.autorizarAccesoAssignment(alumno, assignment);
    if (!assignment.permiteAccionesDeAlumno()) {
      throw new AssignmentNoDisponibleError(assignment.id);
    }
  }

  puedeAdministrar(): boolean {
    return false;
  }

  itemsDeNavegacion(): ItemDeNavegacion[] {
    return [];
  }

  veBannerDeSincronizacion(): boolean {
    return true;
  }
}

export const DOCENTE: RolDeUsuario = new Docente();
export const ESTUDIANTE: RolDeUsuario = new Estudiante();

/**
 * Único punto de decisión de todo el sistema entre docente y alumno — la
 * frontera real (username → rol). Análogo a `EstadoAssignment.desdeNombre`,
 * pero acá no hay columna que leer: el rol se computa desde la lista de
 * admins, así que el lookup es este chequeo, no un `Record`. Se llama una
 * sola vez, en la callback `session()` de NextAuth.
 */
export function resolverRol(githubUsername: string, adminUsernames: string[]): RolDeUsuario {
  return adminUsernames.includes(githubUsername.toLowerCase()) ? DOCENTE : ESTUDIANTE;
}
