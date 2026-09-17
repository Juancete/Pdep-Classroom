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

// Dependencias de lectura que `assignmentsParaMisTps` puede usar según el rol
// — mismo criterio que `FuentesDeConteo` en `Assignment.ts`: se inyectan para
// que el dominio no importe `@/infrastructure/repositories` directamente.
export interface FuentesDeAssignments {
  todos: () => Promise<Assignment[]>;
  deComision: (comisionId: string) => Promise<Assignment[]>;
}

// Ítem de navegación compartido por docente y estudiante: "Mis TPs" siempre
// apunta a `/dashboard`, sólo cambia su posición (home del estudiante vs.
// último ítem del docente, después de sus secciones de admin).
const MIS_TPS: ItemDeNavegacion = { href: "/dashboard", label: "Mis TPs" };

/**
 * Rol de un usuario dentro del sistema, modelado como Strategy en vez de un
 * booleano (`isAdmin`) chequeado en 40+ lugares: cada decisión que dependía
 * de "es admin o no" (autorización de acceso, alcance de las queries, qué
 * navegación mostrar, a qué home aterriza y qué ve/puede hacer en Mis TPs)
 * se delega al objeto concreto. Mismo criterio que `EstadoAssignment` para
 * el ciclo de vida de un assignment.
 *
 * Tres implementaciones: `RolEstudiante` (alumno registrado), `RolDocente`
 * (alcance administrativo global — docente dado de alta en `Docente`
 * o, antes de #83, cualquiera en `ADMIN_GITHUB_USERNAMES`) y `RolResponsable`
 * (subtipo de `RolDocente` por herencia — especializa el comportamiento
 * sobrescribiendo dos métodos: los responsables configurados por entorno,
 * únicos que además pueden gestionar el ABM de docentes).
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
   * `true` si este rol puede dar de alta, editar y desactivar docentes
   * (issue #83). Sólo lo tienen los responsables configurados por entorno —
   * ni un docente dado de alta en la app ni un alumno pueden gestionar
   * accesos, aunque el primero sí `puedeAdministrar()`.
   */
  abstract puedeGestionarDocentes(): boolean;

  /** Ruta a la que aterriza este rol al loguearse o entrar a `/`. */
  abstract rutaDeInicio(): string;

  /** Navegación principal en orden; el primer ítem es `rutaDeInicio()`. */
  abstract itemsDeNavegacion(): ItemDeNavegacion[];

  /** `true` si Mis TPs exige registro confirmado en la comisión activa (si no, redirige a /registro). */
  abstract exigeRegistroDeAlumno(): boolean;

  /** Assignments que este rol lista en Mis TPs. */
  abstract assignmentsParaMisTps(
    fuentes: FuentesDeAssignments,
    comisionActivaId: string | null
  ): Promise<Assignment[]>;

  /** Filtro fino por estado en Mis TPs. */
  abstract veAssignmentEnMisTps(assignment: Assignment, tieneEntrega: boolean): boolean;

  /** Probe no-lanzante: ¿el estado del assignment permite que este rol actúe (aceptar, reintentar)? */
  abstract habilitaAccionesSobre(assignment: Assignment): boolean;

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

class RolDocente extends RolDeUsuario {
  autorizarAccesoAssignment(): void {
    // Alcance global: el docente accede a cualquier assignment.
  }

  autorizarAccionSobreAssignment(): void {
    // Idem — incluso sobre un borrador, para poder probar el flujo.
  }

  puedeAdministrar(): boolean {
    return true;
  }

  puedeGestionarDocentes(): boolean {
    return false;
  }

  rutaDeInicio(): string {
    return "/admin/assignments";
  }

  /**
   * Secciones de `/admin/*` propias de este rol — Template Method que
   * `RolResponsable` extiende sumando "Docentes" sin tocar el resto de
   * `itemsDeNavegacion()` (Mis TPs siempre va al final).
   */
  protected seccionesDeAdmin(): ItemDeNavegacion[] {
    return [
      { href: "/admin/assignments", label: "Assignments" },
      { href: "/admin/grupos", label: "Grupos" },
      { href: "/admin/comisiones", label: "Comisiones" },
      { href: "/admin/alumnos", label: "Alumnos" },
      { href: "/admin/operaciones", label: "Diagnóstico" },
    ];
  }

  itemsDeNavegacion(): ItemDeNavegacion[] {
    // Mis TPs al final: el primer ítem de la navegación es `rutaDeInicio()`.
    return [...this.seccionesDeAdmin(), MIS_TPS];
  }

  exigeRegistroDeAlumno(): boolean {
    return false;
  }

  assignmentsParaMisTps(fuentes: FuentesDeAssignments): Promise<Assignment[]> {
    // Alcance global, igual que el resto del rol: no filtra por comisión.
    return fuentes.todos();
  }

  veAssignmentEnMisTps(): boolean {
    return true;
  }

  habilitaAccionesSobre(): boolean {
    return true;
  }

  veBannerDeSincronizacion(): boolean {
    return false;
  }

  autorizarCambioDeMembresia(): void {
    // El docente resuelve siempre; la UI advierte con confirm() sobre el
    // repo y los colaboradores desincronizados cuando el grupo ya aceptó el TP.
  }

  origenDeAuditoria(): OrigenCambioMembresia {
    return "docente";
  }
}

// Responsable: todo lo que puede hacer un RolDocente (herencia simple: hereda
// todo el comportamiento de RolDocente y sobrescribe sólo lo que cambia —
// issue #83 pide explícitamente "conservar todos los permisos docentes")
// más la gestión del ABM de docentes. Sólo lo tienen los
// usernames configurados en `ADMIN_GITHUB_USERNAMES`: no hay alta de
// responsables desde la aplicación (fuera de alcance del issue).
class RolResponsable extends RolDocente {
  override puedeGestionarDocentes(): boolean {
    return true;
  }

  protected override seccionesDeAdmin(): ItemDeNavegacion[] {
    return [...super.seccionesDeAdmin(), { href: "/admin/docentes", label: "Docentes" }];
  }
}

class RolEstudiante extends RolDeUsuario {
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
    // La mitad "estado habilita" se delega en `habilitaAccionesSobre` (mismo
    // predicado que usa Mis TPs para mostrar u ocultar el botón de Aceptar)
    // sin cambio semántico: acá además se exige comisión vía
    // `autorizarAccesoAssignment`, así que no conviene reusar este método
    // como probe no-lanzante.
    if (!this.habilitaAccionesSobre(assignment)) {
      throw new AssignmentNoDisponibleError(assignment.id);
    }
  }

  puedeAdministrar(): boolean {
    return false;
  }

  puedeGestionarDocentes(): boolean {
    return false;
  }

  rutaDeInicio(): string {
    return "/dashboard";
  }

  itemsDeNavegacion(): ItemDeNavegacion[] {
    return [MIS_TPS];
  }

  exigeRegistroDeAlumno(): boolean {
    return true;
  }

  assignmentsParaMisTps(
    fuentes: FuentesDeAssignments,
    comisionActivaId: string | null
  ): Promise<Assignment[]> {
    return comisionActivaId ? fuentes.deComision(comisionActivaId) : Promise.resolve([]);
  }

  veAssignmentEnMisTps(assignment: Assignment, tieneEntrega: boolean): boolean {
    return assignment.esVisibleParaAlumno(tieneEntrega);
  }

  habilitaAccionesSobre(assignment: Assignment): boolean {
    return assignment.permiteAccionesDeAlumno();
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

export const DOCENTE: RolDeUsuario = new RolDocente();
export const ESTUDIANTE: RolDeUsuario = new RolEstudiante();
export const RESPONSABLE: RolDeUsuario = new RolResponsable();

/**
 * Único punto de decisión de todo el sistema entre responsable, docente y
 * alumno — la frontera real (¿quién es este usuario?) que construye el
 * objeto de rol. Análogo a `EstadoAssignment.desdeNombre`, pero acá no hay
 * columna que leer: la respuesta se arma a partir de dos hechos ya
 * resueltos por el caller (¿está en `ADMIN_GITHUB_USERNAMES`? ¿tiene un
 * registro activo en `Docente`?), no de un `if` de tipo disperso por
 * el resto del sistema.
 *
 * No recibe la sesión ni el username: a partir de #83, un docente
 * puede darse de baja entre una request y la siguiente, así que esto no se
 * puede resolver una sola vez en la callback `session()` de NextAuth (el rol
 * quedaría obsoleto en el JWT) — se llama en cada request, desde
 * `getCurrentUser()`.
 */
export function resolverRol({
  esResponsableDeEntorno,
  esDocenteActivo,
}: {
  esResponsableDeEntorno: boolean;
  esDocenteActivo: boolean;
}): RolDeUsuario {
  if (esResponsableDeEntorno) return RESPONSABLE;
  if (esDocenteActivo) return DOCENTE;
  return ESTUDIANTE;
}
