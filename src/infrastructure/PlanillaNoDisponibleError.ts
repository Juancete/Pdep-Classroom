// Se lanza cuando `upsertarAlumnoEnSheets` no pudo escribir en la planilla
// de la comisión activa (típicamente un 403 de la API de Sheets porque la
// service account tiene rol Viewer y no Editor — ver issue #92). El mensaje
// queda pensado para el admin, no para el alumno: la respuesta HTTP amigable
// se arma aparte en `api-errors.ts`.
//
// Vive en su propio módulo, sin imports, para que `api-errors.ts` pueda
// sumarla a `getRespuestasPorError()` sin arrastrar `googleapis` (que sólo
// necesita quien de verdad llama a la API de Sheets). Mismo criterio que
// `PermisosNoVerificablesError`.
export class PlanillaNoDisponibleError extends Error {
  constructor(cause: unknown) {
    const mensajeDeCausa = cause instanceof Error ? cause.message : "error desconocido";
    super(
      `No se pudo escribir en la planilla de la comisión (${mensajeDeCausa}). ` +
        "Verificá que la planilla esté compartida como Editor con la service account."
    );
    this.name = "PlanillaNoDisponibleError";
    this.cause = cause;
  }
}
