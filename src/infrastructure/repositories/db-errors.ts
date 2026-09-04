/**
 * Constante y helper compartidos para detectar errores del driver de Postgres.
 * Cada repositorio define su propio predicado específico (qué constraint viola)
 * y llama a `extractDbErrorCode` para obtener el código de error sin duplicar
 * la lógica de introspección de `error.cause`.
 */

export const UNIQUE_VIOLATION = "23505";

/**
 * Extrae el código de error del driver de Postgres desde un error desconocido.
 * El driver puede colocar el código directamente en `error.code` o anidado
 * en `error.cause.code` — esta función los unifica.
 * Devuelve `undefined` si el error no es una instancia de `Error`.
 */
export function extractDbErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const cause = error.cause;
  return (
    (error as NodeJS.ErrnoException).code ??
    (cause && typeof cause === "object"
      ? (cause as NodeJS.ErrnoException).code
      : undefined)
  );
}
