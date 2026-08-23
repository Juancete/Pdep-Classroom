// Única fuente de verdad para los valores del enum: el tipo se deriva de acá
// en vez de listarse aparte, igual que `NOMBRES_RESULTADO_CI` en
// `ResultadoCI.ts` — evita que el tipo TS y el check constraint de la
// migración se desincronicen.
export const NOMBRES_ESTADO_DELIVERY = [
  "recibido",
  "procesando",
  "procesado",
  "ignorado",
  "fallido",
] as const;

export type NombreEstadoDelivery = (typeof NOMBRES_ESTADO_DELIVERY)[number];

/**
 * Estado de una entrega de webhook de GitHub (issue #60), modelado como
 * Strategy en vez de un enum + switch — mismo idioma que `ResultadoCI.ts`.
 * Instancias singleton: el estado no tiene datos propios, sólo
 * comportamiento (el delivery guarda por su cuenta el payload/error/intentos
 * asociados).
 */
export abstract class EstadoDelivery {
  abstract get nombre(): NombreEstadoDelivery;

  /** Etiqueta corta para mostrar en la auditoría de deliveries. */
  abstract etiqueta(): string;

  /**
   * `true` si tiene sentido volver a aplicar el efecto de este delivery:
   * `fallido` (el procesamiento tiró) y `recibido` (nunca se llegó siquiera
   * a reclamar). `procesado`/`ignorado` ya terminaron su ciclo y no guardan
   * payload para reprocesar. `procesando` normalmente NO es reprocesable —
   * hay otro proceso en vuelo reclamado atómicamente sobre esa fila — pero
   * `getDeliveriesReprocesables` igual lo trata como candidato cuando quedó
   * "viejo" (la lambda que lo reclamó murió a mitad de camino sin cerrar la
   * fila, dejándola huérfana en ese estado).
   */
  abstract puedeReprocesarse(): boolean;

  static desdeNombre(nombre: NombreEstadoDelivery): EstadoDelivery {
    return ESTADOS_POR_NOMBRE[nombre];
  }
}

class Recibido extends EstadoDelivery {
  get nombre(): NombreEstadoDelivery {
    return "recibido";
  }
  etiqueta(): string {
    return "Recibido";
  }
  puedeReprocesarse(): boolean {
    return true;
  }
}

class Procesando extends EstadoDelivery {
  get nombre(): NombreEstadoDelivery {
    return "procesando";
  }
  etiqueta(): string {
    return "Procesando";
  }
  puedeReprocesarse(): boolean {
    return false;
  }
}

class Procesado extends EstadoDelivery {
  get nombre(): NombreEstadoDelivery {
    return "procesado";
  }
  etiqueta(): string {
    return "Procesado";
  }
  puedeReprocesarse(): boolean {
    return false;
  }
}

class Ignorado extends EstadoDelivery {
  get nombre(): NombreEstadoDelivery {
    return "ignorado";
  }
  etiqueta(): string {
    return "Ignorado";
  }
  puedeReprocesarse(): boolean {
    return false;
  }
}

class Fallido extends EstadoDelivery {
  get nombre(): NombreEstadoDelivery {
    return "fallido";
  }
  etiqueta(): string {
    return "Fallido";
  }
  puedeReprocesarse(): boolean {
    return true;
  }
}

const ESTADOS_POR_NOMBRE: Record<NombreEstadoDelivery, EstadoDelivery> = {
  recibido: new Recibido(),
  procesando: new Procesando(),
  procesado: new Procesado(),
  ignorado: new Ignorado(),
  fallido: new Fallido(),
};
