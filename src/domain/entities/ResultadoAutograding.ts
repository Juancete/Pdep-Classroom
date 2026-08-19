// Única fuente de verdad para los valores del enum: el tipo se deriva de acá
// en vez de listarse aparte, igual que `ACCIONES_CAMBIO_MEMBRESIA` en
// `CambioDeMembresia.ts` — evita que el tipo TS y el check constraint de la
// migración se desincronicen.
export const NOMBRES_RESULTADO_AUTOGRADING = [
  "sin_consultar",
  "sin_autograding",
  "sin_ejecuciones",
  "pendiente",
  "aprobado",
  "fallido",
  "cancelado",
  "error_infra",
] as const;

export type NombreResultadoAutograding = (typeof NOMBRES_RESULTADO_AUTOGRADING)[number];

/**
 * Resultado de la última ejecución de autograding de una entrega, modelado
 * como Strategy en vez de un enum + switch — mismo idioma que
 * `EstadoAssignment.ts`. Instancias singleton: el resultado no tiene datos
 * propios, solo comportamiento (a diferencia de la entrega, que sí guarda el
 * runId/runUrl/commitSha asociados).
 */
export abstract class ResultadoAutograding {
  abstract get nombre(): NombreResultadoAutograding;

  /** Etiqueta corta para mostrar en un badge. */
  abstract etiqueta(): string;

  /** Texto explicativo más largo, para `title`/`aria-label`. */
  abstract detalle(): string;

  /** `true` si no se espera que este resultado cambie sin una acción nueva (push o reejecución). */
  abstract esFinal(): boolean;

  /**
   * `true` si tiene sentido ofrecer el botón de reejecución: sólo cuando hay
   * una ejecución previa completa (con o sin éxito) sobre la que pedir un
   * `rerun`. En `pendiente` ya hay una corriendo; en los estados "sin ..."
   * no hay ninguna ejecución sobre la que reejecutar.
   */
  abstract permiteReejecucion(): boolean;

  static desdeNombre(nombre: NombreResultadoAutograding): ResultadoAutograding {
    return RESULTADOS_POR_NOMBRE[nombre];
  }
}

class SinConsultar extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "sin_consultar";
  }
  etiqueta(): string {
    return "Sin consultar";
  }
  detalle(): string {
    return "Todavía no se consultó el estado de autograding de este repo.";
  }
  esFinal(): boolean {
    return false;
  }
  permiteReejecucion(): boolean {
    return false;
  }
}

class SinAutograding extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "sin_autograding";
  }
  etiqueta(): string {
    return "Sin autograding";
  }
  detalle(): string {
    return "El repo no tiene un workflow de autograding (.github/workflows/autograding.yml).";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return false;
  }
}

class SinEjecuciones extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "sin_ejecuciones";
  }
  etiqueta(): string {
    return "Sin ejecuciones";
  }
  detalle(): string {
    return "El workflow de autograding existe pero todavía no corrió ninguna vez.";
  }
  esFinal(): boolean {
    return false;
  }
  permiteReejecucion(): boolean {
    return false;
  }
}

class Pendiente extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "pendiente";
  }
  etiqueta(): string {
    return "Pendiente";
  }
  detalle(): string {
    return "La ejecución de autograding está encolada o corriendo.";
  }
  esFinal(): boolean {
    return false;
  }
  permiteReejecucion(): boolean {
    return false;
  }
}

class Aprobado extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "aprobado";
  }
  etiqueta(): string {
    return "Aprobado";
  }
  detalle(): string {
    return "Autograding aprobado. Resultado automático — no es la nota final.";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

class Fallido extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "fallido";
  }
  etiqueta(): string {
    return "Tests fallidos";
  }
  detalle(): string {
    return "Autograding con tests fallidos. Resultado automático — no es la nota final.";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

class Cancelado extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "cancelado";
  }
  etiqueta(): string {
    return "Cancelado";
  }
  detalle(): string {
    return "La ejecución de autograding fue cancelada o superó el tiempo máximo.";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

class ErrorInfra extends ResultadoAutograding {
  get nombre(): NombreResultadoAutograding {
    return "error_infra";
  }
  etiqueta(): string {
    return "Error de infraestructura";
  }
  detalle(): string {
    return "La ejecución de autograding no llegó a correr los tests (fallo de infraestructura del workflow).";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

const RESULTADOS_POR_NOMBRE: Record<NombreResultadoAutograding, ResultadoAutograding> = {
  sin_consultar: new SinConsultar(),
  sin_autograding: new SinAutograding(),
  sin_ejecuciones: new SinEjecuciones(),
  pendiente: new Pendiente(),
  aprobado: new Aprobado(),
  fallido: new Fallido(),
  cancelado: new Cancelado(),
  error_infra: new ErrorInfra(),
};

// Mapea la `conclusion` de una GitHub Actions run al resultado de dominio.
// Tabla de datos en vez de una cadena de ifs — un valor de `conclusion`
// desconocido (GitHub puede agregar nuevos) cae a `error_infra` en vez de
// romper.
const RESULTADO_POR_CONCLUSION: Record<string, NombreResultadoAutograding> = {
  success: "aprobado",
  failure: "fallido",
  cancelled: "cancelado",
  timed_out: "cancelado",
  startup_failure: "error_infra",
  action_required: "error_infra",
  stale: "error_infra",
  neutral: "error_infra",
  skipped: "error_infra",
};

/**
 * Resuelve el `ResultadoAutograding` correspondiente a una GitHub Actions
 * run, tal como la devuelve `listWorkflowRunsForWorkflow` (campos `status` y
 * `conclusion`). Mientras la run no terminó (`status !== "completed"`),
 * `conclusion` viene `null` y el resultado es `pendiente`.
 */
export function resultadoDesdeRun(run: {
  status: string;
  conclusion: string | null;
}): ResultadoAutograding {
  if (run.status !== "completed") {
    return ResultadoAutograding.desdeNombre("pendiente");
  }
  return ResultadoAutograding.desdeNombre(
    RESULTADO_POR_CONCLUSION[run.conclusion ?? ""] ?? "error_infra"
  );
}
