const MAX_ERROR_LENGTH = 1000;

/**
 * Convierte un error capturado en un mensaje seguro para persistir/mostrar:
 * redacta tokens y secretos que puedan haber quedado en el mensaje de un
 * error de GitHub, y trunca la longitud. Extraído de
 * `borrarRepositoriosDeAssignment.ts` (issue #50) para reutilizarlo también
 * en `sincronizarAutograding.ts` (issue #58).
 */
export function mensajeOperativo(error: unknown): string {
  const message = error instanceof Error ? error.message : "Error desconocido";
  return message
    .replace(/\b(?:github_pat|gh[pousr])_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(authorization|token|password|cookie)(\s*[:=]\s*)\S+/gi,
      "$1$2[REDACTED]"
    )
    .slice(0, MAX_ERROR_LENGTH);
}
