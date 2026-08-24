import type { Alumno } from "./Alumno";
import type { Assignment } from "./Assignment";
import { AssignmentNoDisponibleError } from "./Assignment";
import type { GrupalAssignment } from "./GrupalAssignment";
import type { Grupo } from "./Grupo";
import { InscripcionesCerradasError, GrupoConEntregaError } from "./Grupo";

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

export type OrigenCambioMembresia = "alumno" | "docente";

/** Contexto que necesita evaluar una autorización de cambio de membresía. */
export interface ContextoDeMembresia {
  assignment: GrupalAssignment;
  grupo: Grupo;
  grupoTieneEntrega: boolean;
}

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

  /**
   * Autoriza que este rol modifique la composición de un grupo (salir,
   * cambiarse, o que el docente mueva/quite integrantes). Docente: resuelve
   * siempre — la UI es la que advierte con un `confirm()` sobre el repo y
   * los colaboradores. Alumno: exige inscripciones abiertas y que el grupo
   * no tenga entrega todavía.
   */
  abstract autorizarCambioDeMembresia(contexto: ContextoDeMembresia): void;

  /** Valor a persistir en la auditoría de membresías: quién originó el cambio. */
  abstract origenDeAuditoria(): OrigenCambioMembresia;

  /**
   * Sondea `autorizarCambioDeMembresia` sin ejecutarla: devuelve el motivo
   * del bloqueo, o `null` si el cambio está permitido. Mismo idioma que
   * `transicionesDisponibles` para el ciclo de vida de un assignment — la UI
   * y el servidor no pueden divergir, porque el texto que ve el alumno ES el
   * `message` del error que el servidor tiraría si igual manda el request.
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
      { href: "/admin/operaciones", label: "Operación" },
    ];
  }

  veBannerDeSincronizacion(): boolean {
    return false;
  }

  autorizarCambioDeMembresia(): void {
    // El docente resuelve siempre; la UI advierte con confirm() sobre el
    // repo y los colaboradores desincronizados cuando el grupo ya entregó.
  }

  origenDeAuditoria(): OrigenCambioMembresia {
    return "docente";
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

  autorizarCambioDeMembresia({ assignment, grupo, grupoTieneEntrega }: ContextoDeMembresia): void {
    if (!assignment.aceptaNuevasInscripciones()) {
      throw new InscripcionesCerradasError(assignment.id);
    }
    if (grupoTieneEntrega) {
      throw new GrupoConEntregaError(grupo.id);
    }
  }

  origenDeAuditoria(): OrigenCambioMembresia {
    return "alumno";
  }
}

export const DOCENTE: RolDeUsuario = new Docente();
export const ESTUDIANTE: RolDeUsuario = new Estudiante();

/**
 * Nombre serializable de un rol — lo único de `RolDeUsuario` que puede viajar
 * dentro del objeto de sesión de NextAuth. Auth.js clona ese objeto
 * internamente antes de devolverlo desde `auth()`, y el clon no preserva el
 * prototype de una instancia de clase: como `DOCENTE`/`ESTUDIANTE` no tienen
 * datos propios (todo su comportamiento vive en el prototype), lo que
 * sobrevive al clon es un objeto vacío sin métodos. Por eso la sesión guarda
 * este string, no la instancia — y `rolDesdeNombre` la reconstruye del lado
 * del consumidor, después del clon.
 */
export type NombreRolDeUsuario = "docente" | "alumno";

export function rolDesdeNombre(nombre: NombreRolDeUsuario): RolDeUsuario {
  return nombre === "docente" ? DOCENTE : ESTUDIANTE;
}

/**
 * Único punto de decisión de todo el sistema entre docente y alumno — la
 * frontera real (username → rol). Análogo a `EstadoAssignment.desdeNombre`,
 * pero acá no hay columna que leer: el rol se computa desde la lista de
 * admins, así que el lookup es este chequeo, no un `Record`. Se llama una
 * sola vez, en la callback `session()` de NextAuth.
 */
export function resolverRol(githubUsername: string, adminUsernames: string[]): RolDeUsuario {
  const usernameNormalizado = githubUsername.toLowerCase();
  return adminUsernames.some((admin) => admin.toLowerCase() === usernameNormalizado)
    ? DOCENTE
    : ESTUDIANTE;
}
