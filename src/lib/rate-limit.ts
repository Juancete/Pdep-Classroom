// Rate limiter en memoria para prevenir doble-submit en endpoints críticos.
// En producción serverless, este estado es por instancia de lambda —
// suficiente para el caso de uso: evitar el double-click del mismo usuario.

const lastRequest = new Map<string, number>();

/**
 * Verifica si una clave puede hacer una nueva request.
 * @returns true si la request está permitida, false si debe ser rechazada (429).
 */
export function checkRateLimit(key: string, windowMs = 3000): boolean {
  const now = Date.now();
  const last = lastRequest.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  lastRequest.set(key, now);
  return true;
}

/** Solo para tests: resetea el estado interno del rate limiter. */
export function _resetRateLimits(): void {
  lastRequest.clear();
}
