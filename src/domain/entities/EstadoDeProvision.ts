// Única fuente de verdad para los valores del enum: el tipo se deriva de acá
// en vez de listarse aparte, igual que `NOMBRES_RESULTADO_CI` en
// `ResultadoCI.ts` — evita que el tipo TS y el check constraint de la
// migración se desincronicen.
export const NOMBRES_ESTADO_DE_PROVISION = ["pendiente", "activa", "fallida"] as const;

export type NombreEstadoDeProvision = (typeof NOMBRES_ESTADO_DE_PROVISION)[number];

export type TonoDeAviso = "advertencia" | "error";

export interface AvisoDeProvision {
  etiqueta: string;
  tono: TonoDeAviso;
}

const MENSAJE_CREANDO_REPO = "Estamos creando el repositorio.";
const MENSAJE_CREACION_QUEDO_PENDIENTE =
  "La creación del repo quedó pendiente antes de archivar el TP.";

/**
 * Estado de la saga de aprovisionamiento del repo de una entrega, modelado
 * como Strategy en vez de un enum + ifs sobre el string — mismo idioma que
 * `ResultadoCI.ts`. Instancias singleton: el estado no tiene datos propios,
 * sólo comportamiento (la entrega guarda por su cuenta intentos y último
 * error).
 */
export abstract class EstadoDeProvision {
  abstract get nombre(): NombreEstadoDeProvision;

  /** `true` sólo cuando la provisión terminó bien: condición necesaria para `Entrega.hasRepo()`. */
  abstract tieneRepoActivo(): boolean;

  /** `true` si otra request puede estar aprovisionando ahora mismo (lo que mira `Entrega.provisionEnCurso`). */
  abstract puedeEstarEnCurso(): boolean;

  /** Aviso para el panel de admin, o `null` si no hay nada que avisar. */
  abstract aviso(): AvisoDeProvision | null;

  /**
   * Mensaje para el alumno cuando la entrega no tiene repo activo.
   * `puedeActuar`: el assignment admite acciones del alumno (publicado) o no
   * (archivado).
   */
  abstract mensajeParaAlumno(puedeActuar: boolean): string;

  static desdeNombre(nombre: NombreEstadoDeProvision): EstadoDeProvision {
    return ESTADOS_POR_NOMBRE[nombre];
  }
}

class Pendiente extends EstadoDeProvision {
  get nombre(): NombreEstadoDeProvision {
    return "pendiente";
  }
  tieneRepoActivo(): boolean {
    return false;
  }
  puedeEstarEnCurso(): boolean {
    return true;
  }
  aviso(): AvisoDeProvision {
    return { etiqueta: "Aprovisionamiento pendiente", tono: "advertencia" };
  }
  mensajeParaAlumno(puedeActuar: boolean): string {
    return puedeActuar ? MENSAJE_CREANDO_REPO : MENSAJE_CREACION_QUEDO_PENDIENTE;
  }
}

class Activa extends EstadoDeProvision {
  get nombre(): NombreEstadoDeProvision {
    return "activa";
  }
  tieneRepoActivo(): boolean {
    return true;
  }
  puedeEstarEnCurso(): boolean {
    return false;
  }
  aviso(): null {
    return null;
  }
  mensajeParaAlumno(puedeActuar: boolean): string {
    // Una provisión activa sin repo (URL ausente o repo borrado) cae acá; el
    // dashboard siempre mostró para ese caso los textos de pendiente y se
    // conserva (refactor puro, #144).
    return puedeActuar ? MENSAJE_CREANDO_REPO : MENSAJE_CREACION_QUEDO_PENDIENTE;
  }
}

class Fallida extends EstadoDeProvision {
  get nombre(): NombreEstadoDeProvision {
    return "fallida";
  }
  tieneRepoActivo(): boolean {
    return false;
  }
  puedeEstarEnCurso(): boolean {
    return false;
  }
  aviso(): AvisoDeProvision {
    return { etiqueta: "Aprovisionamiento fallido", tono: "error" };
  }
  mensajeParaAlumno(puedeActuar: boolean): string {
    return puedeActuar
      ? "No se pudo crear el repo. Podés reintentar."
      : "No se pudo crear el repo antes de archivar el TP. Consultá al equipo docente.";
  }
}

const ESTADOS_POR_NOMBRE: Record<NombreEstadoDeProvision, EstadoDeProvision> = {
  pendiente: new Pendiente(),
  activa: new Activa(),
  fallida: new Fallida(),
};
