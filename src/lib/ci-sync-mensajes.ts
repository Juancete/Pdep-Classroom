import type { SincronizarCIResult } from "@/application/sincronizarCI";

/**
 * Arma el mensaje de advertencia que ven los botones "Actualizar CI" cuando
 * `sincronizarCIDeEntregas` devuelve entregas en `fallidas` (ej. la GitHub
 * App sin permiso `checks` responde 403 — issue #98). Sin fallidas, `null`
 * — el caller no debería mostrar nada.
 */
export function mensajeDeFallosDeCI(resultado: SincronizarCIResult): string | null {
  const [primeraFallida, ...restoDeFallidas] = resultado.fallidas;
  if (!primeraFallida) return null;

  const mensajeBase = `No se pudo actualizar el CI de ${primeraFallida.repoName}: ${primeraFallida.error}`;
  if (restoDeFallidas.length === 0) return mensajeBase;

  return `${mensajeBase} (y ${restoDeFallidas.length} más)`;
}
