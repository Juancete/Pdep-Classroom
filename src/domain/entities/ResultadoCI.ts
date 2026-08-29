// Única fuente de verdad para los valores del enum: el tipo se deriva de acá
// en vez de listarse aparte, igual que `ACCIONES_CAMBIO_MEMBRESIA` en
// `CambioDeMembresia.ts` — evita que el tipo TS y el check constraint de la
// migración se desincronicen.
export const NOMBRES_RESULTADO_CI = [
  "sin_consultar",
  "sin_ci",
  "pendiente",
  "passing",
  "failing",
  "cancelado",
  "error_infra",
] as const;

export type NombreResultadoCI = (typeof NOMBRES_RESULTADO_CI)[number];

// Se lanza al intentar reejecutar CI sobre una entrega que no tiene de dónde
// pedir el rerequest: ni el resultado combinado lo permite
// (`permiteReejecucion()` en `pendiente`/`sin_ci`/`sin_consultar`) ni,
// aunque lo permita, hay check suites concretos guardados para reenviar a
// GitHub (estado inconsistente, pero posible). Es la única fuente que usan
// tanto `ci/rerun/route.ts` como `sincronizarCI.reejecutarCIDeEntrega` — así
// no pueden volver a divergir en qué casos habilitan el botón. La route la
// traduce a 409.
export class ReejecucionCINoDisponibleError extends Error {
  constructor(public readonly entregaId: string) {
    super("No hay checks previos de CI para reejecutar");
    this.name = "ReejecucionCINoDisponibleError";
  }
}

/**
 * Resultado del estado combinado de CI (GitHub Checks) de una entrega,
 * modelado como Strategy en vez de un enum + switch — mismo idioma que
 * `EstadoAssignment.ts`. Instancias singleton: el resultado no tiene datos
 * propios, solo comportamiento (la entrega guarda por su cuenta el
 * commitSha/detalleUrl/checkSuiteIds asociados).
 *
 * No hay un workflow "de CI" con nombre fijo: se lee el estado combinado de
 * todos los checks del último commit del branch por defecto (mismo mecanismo
 * que un badge de CI en un README), así que cualquier *.yml en
 * `.github/workflows/` cuenta, sin importar cómo se llame.
 */
export abstract class ResultadoCI {
  abstract get nombre(): NombreResultadoCI;

  /** Etiqueta corta para mostrar en un badge. */
  abstract etiqueta(): string;

  /** Texto explicativo más largo, para `title`/`aria-label`. */
  abstract detalle(): string;

  /** `true` si no se espera que este resultado cambie sin una acción nueva (push o reejecución). */
  abstract esFinal(): boolean;

  /**
   * `true` si tiene sentido ofrecer el botón de reejecución: sólo cuando hay
   * al menos un check suite previo sobre el que pedir un `rerequest`. En
   * `pendiente` ya hay uno corriendo; en `sin_ci` no hay ningún check.
   */
  abstract permiteReejecucion(): boolean;

  static desdeNombre(nombre: NombreResultadoCI): ResultadoCI {
    return RESULTADOS_POR_NOMBRE[nombre];
  }
}

class SinConsultar extends ResultadoCI {
  get nombre(): NombreResultadoCI {
    return "sin_consultar";
  }
  etiqueta(): string {
    return "Sin consultar";
  }
  detalle(): string {
    return "Todavía no se consultó el estado de CI de este repo.";
  }
  esFinal(): boolean {
    return false;
  }
  permiteReejecucion(): boolean {
    return false;
  }
}

class SinCI extends ResultadoCI {
  get nombre(): NombreResultadoCI {
    return "sin_ci";
  }
  etiqueta(): string {
    return "Sin CI";
  }
  detalle(): string {
    return "El repo no tiene checks de CI configurados (o todavía no corrieron ninguno).";
  }
  esFinal(): boolean {
    return false;
  }
  permiteReejecucion(): boolean {
    return false;
  }
}

class Pendiente extends ResultadoCI {
  get nombre(): NombreResultadoCI {
    return "pendiente";
  }
  etiqueta(): string {
    return "Pendiente";
  }
  detalle(): string {
    return "La ejecución de CI está encolada o corriendo.";
  }
  esFinal(): boolean {
    return false;
  }
  permiteReejecucion(): boolean {
    return false;
  }
}

class Passing extends ResultadoCI {
  get nombre(): NombreResultadoCI {
    return "passing";
  }
  etiqueta(): string {
    return "Passing";
  }
  detalle(): string {
    return "CI passing. Resultado automático — no es la nota final.";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

class Failing extends ResultadoCI {
  get nombre(): NombreResultadoCI {
    return "failing";
  }
  etiqueta(): string {
    return "Failing";
  }
  detalle(): string {
    return "CI failing. Resultado automático — no es la nota final.";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

class Cancelado extends ResultadoCI {
  get nombre(): NombreResultadoCI {
    return "cancelado";
  }
  etiqueta(): string {
    return "Cancelado";
  }
  detalle(): string {
    return "La ejecución de CI fue cancelada o superó el tiempo máximo.";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

class ErrorInfra extends ResultadoCI {
  get nombre(): NombreResultadoCI {
    return "error_infra";
  }
  etiqueta(): string {
    return "Error de infraestructura";
  }
  detalle(): string {
    return "La ejecución de CI requiere intervención manual o no llegó a correr los tests (fallo de infraestructura).";
  }
  esFinal(): boolean {
    return true;
  }
  permiteReejecucion(): boolean {
    return true;
  }
}

const RESULTADOS_POR_NOMBRE: Record<NombreResultadoCI, ResultadoCI> = {
  sin_consultar: new SinConsultar(),
  sin_ci: new SinCI(),
  pendiente: new Pendiente(),
  passing: new Passing(),
  failing: new Failing(),
  cancelado: new Cancelado(),
  error_infra: new ErrorInfra(),
};

type ConclusionDeCheckRun =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null;

export interface CheckRunResumen {
  status: string;
  conclusion: ConclusionDeCheckRun;
}

/**
 * Agrega el estado combinado de todos los check runs del último commit del
 * branch por defecto — mismo criterio "peor estado gana" que usa GitHub en
 * la UI de checks de un commit/PR, y el mismo mecanismo que un badge de CI
 * en un README (no depende de un workflow con nombre fijo).
 */
export function resultadoDesdeCheckRuns(checkRuns: CheckRunResumen[]): ResultadoCI {
  if (checkRuns.length === 0) {
    return ResultadoCI.desdeNombre("sin_ci");
  }
  if (checkRuns.some((run) => run.status !== "completed")) {
    return ResultadoCI.desdeNombre("pendiente");
  }

  const conclusiones = checkRuns.map((run) => run.conclusion);
  if (conclusiones.some((conclusion) => conclusion === "failure")) {
    return ResultadoCI.desdeNombre("failing");
  }
  if (conclusiones.some((conclusion) => conclusion === "action_required" || conclusion === null)) {
    return ResultadoCI.desdeNombre("error_infra");
  }
  if (conclusiones.some((conclusion) => conclusion === "cancelled" || conclusion === "timed_out")) {
    return ResultadoCI.desdeNombre("cancelado");
  }
  // El resto son success/neutral/skipped — ninguno bloquea "passing", mismo
  // criterio que la vista de checks combinados de GitHub.
  return ResultadoCI.desdeNombre("passing");
}
