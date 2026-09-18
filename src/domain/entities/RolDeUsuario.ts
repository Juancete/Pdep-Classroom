import type { Alumno } from "./Alumno";
import type { Comision } from "./Comision";
import {
  Participante,
  ParticipanteAlumno,
  ParticipanteDocente,
  AccesoAssignmentProhibidoError,
  type ActorDeMembresia,
} from "./Participante";

export type ItemDeNavegacion = { href: string; label: string };

// Dependencias de lectura que `comoParticipante` puede usar según el rol —
// mismo criterio que `FuentesDeConteo` en `Assignment.ts`: se inyectan para
// que el dominio no importe `@/infrastructure/repositories` directamente.
// Cada rol consulta sólo la fuente que necesita: el estudiante pide
// `alumno`, el docente pide `comisionActiva`.
export interface FuentesDeParticipante {
  alumno: () => Promise<Alumno | null>;
  comisionActiva: () => Promise<Comision | null>;
}

// Ítem de navegación compartido por docente y estudiante: "Mis TPs" siempre
// apunta a `/dashboard`, sólo cambia su posición (home del estudiante vs.
// último ítem del docente, después de sus secciones de admin).
const MIS_TPS: ItemDeNavegacion = { href: "/dashboard", label: "Mis TPs" };

/**
 * Rol de un usuario dentro del sistema, modelado como Strategy en vez de un
 * booleano (`isAdmin`) chequeado en 40+ lugares. Desde el issue #107/#112,
 * `RolDeUsuario` queda **sólo con el alcance administrativo y la
 * navegación**: quién puede administrar el sistema, a qué home aterriza,
 * qué nav ve, y quién puede actuar sobre la membresía de *otro*
 * (`actorSobreMembresiaAjena`). La autorización académica de Mis TPs
 * (acceso por comisión, habilitación por estado, reglas de membresía sobre
 * sí mismo) se mudó a `Participante` — un docente ahí sigue exactamente las
 * mismas reglas que un alumno, así que esa decisión ya no depende del rol.
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
   * `true` si este rol tiene alcance administrativo global (ve todo el
   * padrón, todas las comisiones, gestiona assignments/grupos/docentes de
   * otros). Un único predicado reusado donde antes se preguntaba `isAdmin`
   * para decidir qué datos traer, no una regla de negocio nueva por sitio.
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

  /** `true` si este rol debe ver el banner de sincronización pendiente. */
  abstract veBannerDeSincronizacion(): boolean;

  /**
   * Construye el `Participante` con el que este rol actúa en los flujos
   * self-service de Mis TPs. Cada rol consulta sólo la fuente que necesita
   * (mismo idioma que `FuentesDeConteo`): el estudiante pide `fuentes.alumno()`,
   * el docente pide `fuentes.comisionActiva()`.
   */
  abstract comoParticipante(
    githubUsername: string,
    fuentes: FuentesDeParticipante
  ): Promise<Participante>;

  /**
   * `ActorDeMembresia` con el que este rol administra la membresía de *otro*
   * (no la propia — para eso está `comoParticipante`). El docente resuelve
   * siempre — la UI advierte con un `confirm()` sobre el repo y los
   * colaboradores desincronizados cuando el grupo ya aceptó el TP. Un
   * alumno nunca administra a otros: lanza `AccesoAssignmentProhibidoError`.
   */
  abstract actorSobreMembresiaAjena(assignmentId: string): ActorDeMembresia;
}

class RolDocente extends RolDeUsuario {
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
      { href: "/admin/alumnos", label: "Alumnos" },
      { href: "/admin/comisiones", label: "Comisiones" },
      { href: "/admin/operaciones", label: "Diagnóstico" },
    ];
  }

  itemsDeNavegacion(): ItemDeNavegacion[] {
    // Mis TPs al final: el primer ítem de la navegación es `rutaDeInicio()`.
    return [...this.seccionesDeAdmin(), MIS_TPS];
  }

  veBannerDeSincronizacion(): boolean {
    return false;
  }

  async comoParticipante(
    githubUsername: string,
    fuentes: FuentesDeParticipante
  ): Promise<Participante> {
    return new ParticipanteDocente(githubUsername, await fuentes.comisionActiva());
  }

  actorSobreMembresiaAjena(): ActorDeMembresia {
    return {
      // El docente resuelve siempre; la UI advierte con confirm() sobre el
      // repo y los colaboradores desincronizados cuando el grupo ya aceptó el TP.
      autorizarCambioDeMembresia: () => {},
      origenDeAuditoria: () => "docente",
    };
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

  veBannerDeSincronizacion(): boolean {
    return true;
  }

  async comoParticipante(
    githubUsername: string,
    fuentes: FuentesDeParticipante
  ): Promise<Participante> {
    return new ParticipanteAlumno(await fuentes.alumno(), githubUsername);
  }

  actorSobreMembresiaAjena(assignmentId: string): ActorDeMembresia {
    // Un alumno nunca administra la membresía de otro — sólo la propia, vía
    // `comoParticipante`. La ruta que llama a esto ya distinguió "es propia"
    // antes de pedir el actor; llegar hasta acá es intentar tocar a un
    // tercero.
    throw new AccesoAssignmentProhibidoError(assignmentId);
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
