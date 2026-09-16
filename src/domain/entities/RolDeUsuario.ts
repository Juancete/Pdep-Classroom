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
 * Tres implementaciones: `Estudiante` (alumno registrado), `Docente`
 * (alcance administrativo global — ayudante dado de alta en `Administrador`
 * o, antes de #83, cualquiera en `ADMIN_GITHUB_USERNAMES`) y `Responsable`
 * (subtipo de `Docente` por herencia — especializa el comportamiento
 * sobrescribiendo dos métodos: los responsables configurados por entorno,
 * únicos que además pueden gestionar el ABM de administradores).
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

  /**
   * `true` si este rol puede dar de alta, editar y desactivar administradores
   * (issue #83). Sólo lo tienen los responsables configurados por entorno —
   * ni un docente dado de alta en la app ni un alumno pueden gestionar
   * accesos, aunque el primero sí `puedeAdministrar()`.
   */
  abstract puedeGestionarAdministradores(): boolean;

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

  puedeGestionarAdministradores(): boolean {
    return false;
  }

  itemsDeNavegacion(): ItemDeNavegacion[] {
    return [
      { href: "/admin/assignments", label: "Assignments" },
      { href: "/admin/grupos", label: "Grupos" },
      { href: "/admin/comisiones", label: "Comisiones" },
      { href: "/admin/alumnos", label: "Alumnos" },
      { href: "/admin/operaciones", label: "Diagnóstico" },
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

// Responsable: todo lo que puede hacer un Docente (herencia simple: hereda
// todo el comportamiento de Docente y sobrescribe sólo lo que cambia —
// issue #83 pide explícitamente "conservar todos los permisos docentes")
// más la gestión del ABM de administradores. Sólo lo tienen los
// usernames configurados en `ADMIN_GITHUB_USERNAMES`: no hay alta de
// responsables desde la aplicación (fuera de alcance del issue).
class Responsable extends Docente {
  override puedeGestionarAdministradores(): boolean {
    return true;
  }

  override itemsDeNavegacion(): ItemDeNavegacion[] {
    return [...super.itemsDeNavegacion(), { href: "/admin/administradores", label: "Administradores" }];
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

  puedeGestionarAdministradores(): boolean {
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
export const RESPONSABLE: RolDeUsuario = new Responsable();

/**
 * Único punto de decisión de todo el sistema entre responsable, docente y
 * alumno — la frontera real (¿quién es este usuario?) que construye el
 * objeto de rol. Análogo a `EstadoAssignment.desdeNombre`, pero acá no hay
 * columna que leer: la respuesta se arma a partir de dos hechos ya
 * resueltos por el caller (¿está en `ADMIN_GITHUB_USERNAMES`? ¿tiene un
 * registro activo en `Administrador`?), no de un `if` de tipo disperso por
 * el resto del sistema.
 *
 * No recibe la sesión ni el username: a partir de #83, un administrador
 * puede darse de baja entre una request y la siguiente, así que esto no se
 * puede resolver una sola vez en la callback `session()` de NextAuth (el rol
 * quedaría obsoleto en el JWT) — se llama en cada request, desde
 * `getCurrentUser()`.
 */
export function resolverRol({
  esResponsableDeEntorno,
  esAdministradorActivo,
}: {
  esResponsableDeEntorno: boolean;
  esAdministradorActivo: boolean;
}): RolDeUsuario {
  if (esResponsableDeEntorno) return RESPONSABLE;
  if (esAdministradorActivo) return DOCENTE;
  return ESTUDIANTE;
}
