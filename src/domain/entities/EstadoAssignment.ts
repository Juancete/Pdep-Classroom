export type NombreEstadoAssignment = "borrador" | "publicado" | "archivado";

export const NOMBRES_ESTADO_ASSIGNMENT: readonly NombreEstadoAssignment[] = [
  "borrador",
  "publicado",
  "archivado",
] as const;

/**
 * Lanzado cuando se pide una transición de estado que la regla del assignment
 * no permite (ej: despublicar un assignment con entregas). El handler HTTP lo
 * traduce a 409.
 */
export class TransicionDeEstadoInvalidaError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly desde: NombreEstadoAssignment,
    public readonly hacia: NombreEstadoAssignment,
    motivo: string
  ) {
    super(`No se puede pasar de "${desde}" a "${hacia}": ${motivo}`);
    this.name = "TransicionDeEstadoInvalidaError";
  }
}

/** Contexto que necesita evaluar una transición de estado. */
export interface ContextoTransicionEstado {
  tieneEntregas: boolean;
}

/**
 * Estado del ciclo de vida de un assignment, modelado como Strategy en vez de
 * un enum + switch: cada operación que depende del estado (visibilidad para
 * el alumno, si habilita aceptar/gestionar grupo, a qué estados puede pasar)
 * se delega al objeto concreto. Evita ifs de tipo repetidos en autorización,
 * listados y UI.
 *
 * Instancias singleton — el estado no tiene datos propios, solo comportamiento.
 */
export abstract class EstadoAssignment {
  abstract get nombre(): NombreEstadoAssignment;

  abstract etiqueta(): string;

  /**
   * `true` si un alumno con este assignment en este estado debe verlo en su
   * dashboard. Borrador: nunca. Publicado: siempre. Archivado: solo si ya
   * tiene una entrega (preserva el acceso al trabajo ya hecho).
   */
  abstract esVisibleParaAlumno(tieneEntrega: boolean): boolean;

  /**
   * `true` si el estado habilita que un alumno acepte el TP o gestione grupos
   * (crear/unirse). Solo publicado lo permite.
   */
  abstract permiteAccionesDeAlumno(): boolean;

  /**
   * `true` si el estado en sí mismo no impide un borrado físico (no
   * histórico) del assignment — sólo `borrador`. `Assignment.puedeEliminarse`
   * combina esto con que no tenga entregas ni grupos asociados.
   */
  abstract permiteEliminacion(): boolean;

  /**
   * `true` si el estado habilita el borrado masivo de repos de GitHub de
   * las entregas — sólo `archivado` (Fase 3 de la auditoría de dominio):
   * antes se chequeaba `estadoNombre === "archivado"` suelto en 3 lugares
   * (route de borrado de repos, panel admin, detalle de assignment).
   */
  abstract permiteBorrarRepos(): boolean;

  /**
   * `true` si el estado habilita editar campos estructurales (slug,
   * template, paradigma, tipo, máximo de integrantes) — sólo `borrador`.
   * `Assignment.actualizarEstructura` combina esto con qué campos
   * efectivamente cambian.
   */
  abstract permiteEditarEstructura(): boolean;

  /**
   * `true` si en este estado ya pudo haber alumnos aceptando el TP, por lo
   * que tiene sentido contar pendientes/aceptadas — Borrador: `false`
   * (todavía no es aceptable); Publicado y Archivado: `true` (ya lo fue, o
   * lo sigue siendo). No es lo mismo que `permiteEditarEstructura()`: ese
   * predicado es sobre si la estructura puede cambiar, no sobre si hay
   * (o pudo haber) entregas — coincidían por casualidad en Borrador y
   * divergen en Archivado.
   */
  abstract esperaEntregas(): boolean;

  /**
   * Resuelve la transición a `destino` dado el contexto del assignment.
   * Devuelve el nuevo estado o lanza `TransicionDeEstadoInvalidaError`.
   */
  abstract transicionarA(
    assignmentId: string,
    destino: NombreEstadoAssignment,
    contexto: ContextoTransicionEstado
  ): EstadoAssignment;

  /**
   * Sondea `transicionarA` sin ejecutarla: devuelve el motivo del bloqueo,
   * o `null` si la transición está permitida. Mismo idioma que
   * `RolDeUsuario.motivoDeBloqueoDeMembresia` — la UI y el servidor no
   * pueden divergir, porque el texto que ve el admin ES el `message` del
   * error que el servidor tiraría si igual manda el request.
   */
  motivoDeBloqueo(
    assignmentId: string,
    destino: NombreEstadoAssignment,
    contexto: ContextoTransicionEstado
  ): string | null {
    try {
      this.transicionarA(assignmentId, destino, contexto);
      return null;
    } catch (error) {
      if (error instanceof TransicionDeEstadoInvalidaError) {
        return error.message;
      }
      throw error;
    }
  }

  static desdeNombre(nombre: NombreEstadoAssignment): EstadoAssignment {
    return ESTADOS_POR_NOMBRE[nombre];
  }
}

class Borrador extends EstadoAssignment {
  get nombre(): NombreEstadoAssignment {
    return "borrador";
  }

  etiqueta(): string {
    return "Borrador";
  }

  esVisibleParaAlumno(_tieneEntrega: boolean): boolean {
    return false;
  }

  permiteAccionesDeAlumno(): boolean {
    return false;
  }

  permiteEliminacion(): boolean {
    return true;
  }

  permiteBorrarRepos(): boolean {
    return false;
  }

  permiteEditarEstructura(): boolean {
    return true;
  }

  esperaEntregas(): boolean {
    return false;
  }

  transicionarA(
    assignmentId: string,
    destino: NombreEstadoAssignment,
    _contexto: ContextoTransicionEstado
  ): EstadoAssignment {
    if (destino === "borrador") return this;
    if (destino === "publicado" || destino === "archivado") {
      return EstadoAssignment.desdeNombre(destino);
    }
    throw new TransicionDeEstadoInvalidaError(
      assignmentId,
      this.nombre,
      destino,
      "estado destino desconocido"
    );
  }
}

class Publicado extends EstadoAssignment {
  get nombre(): NombreEstadoAssignment {
    return "publicado";
  }

  etiqueta(): string {
    return "Publicado";
  }

  esVisibleParaAlumno(_tieneEntrega: boolean): boolean {
    return true;
  }

  permiteAccionesDeAlumno(): boolean {
    return true;
  }

  permiteEliminacion(): boolean {
    return false;
  }

  permiteBorrarRepos(): boolean {
    return false;
  }

  permiteEditarEstructura(): boolean {
    return false;
  }

  esperaEntregas(): boolean {
    return true;
  }

  transicionarA(
    assignmentId: string,
    destino: NombreEstadoAssignment,
    contexto: ContextoTransicionEstado
  ): EstadoAssignment {
    if (destino === "publicado") return this;
    if (destino === "borrador") {
      if (contexto.tieneEntregas) {
        throw new TransicionDeEstadoInvalidaError(
          assignmentId,
          this.nombre,
          destino,
          "tiene entregas — archivalo en vez de despublicarlo"
        );
      }
      return EstadoAssignment.desdeNombre("borrador");
    }
    if (destino === "archivado") {
      return EstadoAssignment.desdeNombre("archivado");
    }
    throw new TransicionDeEstadoInvalidaError(
      assignmentId,
      this.nombre,
      destino,
      "estado destino desconocido"
    );
  }
}

class Archivado extends EstadoAssignment {
  get nombre(): NombreEstadoAssignment {
    return "archivado";
  }

  etiqueta(): string {
    return "Archivado";
  }

  esVisibleParaAlumno(tieneEntrega: boolean): boolean {
    return tieneEntrega;
  }

  permiteAccionesDeAlumno(): boolean {
    return false;
  }

  permiteEliminacion(): boolean {
    return false;
  }

  permiteBorrarRepos(): boolean {
    return true;
  }

  permiteEditarEstructura(): boolean {
    return false;
  }

  esperaEntregas(): boolean {
    return true;
  }

  transicionarA(
    assignmentId: string,
    destino: NombreEstadoAssignment,
    _contexto: ContextoTransicionEstado
  ): EstadoAssignment {
    if (destino === "archivado") return this;
    if (destino === "publicado") {
      return EstadoAssignment.desdeNombre("publicado");
    }
    throw new TransicionDeEstadoInvalidaError(
      assignmentId,
      this.nombre,
      destino,
      "un archivado solo puede volver a publicarse, no a borrador"
    );
  }
}

const ESTADOS_POR_NOMBRE: Record<NombreEstadoAssignment, EstadoAssignment> = {
  borrador: new Borrador(),
  publicado: new Publicado(),
  archivado: new Archivado(),
};

/**
 * Estados a los que `estado` puede transicionar dado el contexto — reusa
 * `transicionarA` en modo de sondeo (no muta nada: los estados son
 * singletons sin datos propios) para no duplicar las reglas de transición en
 * la UI. Usado por el panel admin para decidir qué botones ofrecer.
 */
export function transicionesDisponibles(
  estado: EstadoAssignment,
  assignmentId: string,
  contexto: ContextoTransicionEstado
): NombreEstadoAssignment[] {
  return NOMBRES_ESTADO_ASSIGNMENT.filter((destino) => {
    if (destino === estado.nombre) return false;
    try {
      estado.transicionarA(assignmentId, destino, contexto);
      return true;
    } catch {
      return false;
    }
  });
}
