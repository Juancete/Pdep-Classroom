import type { SincronizarLoteResult } from "@/application/sincronizarLote";
import type { SincronizarCIResult } from "@/application/sincronizarCI";
import type { SincronizarParticipacionResult } from "@/application/sincronizarParticipacion";

/**
 * Arma el mensaje de advertencia que ve el botón "Actualizar" cuando un lote
 * (CI o participación, issue #122) devuelve entregas en `fallidas` (ej. la
 * GitHub App sin permiso `checks` responde 403 — issue #98). `que` nombra lo
 * que se intentó actualizar ("el CI", "la participación"). Sin fallidas,
 * `null` — el caller no debería mostrar nada.
 */
export function mensajeDeFallos(resultado: SincronizarLoteResult, que: string): string | null {
  const [primeraFallida, ...restoDeFallidas] = resultado.fallidas;
  if (!primeraFallida) return null;

  const mensajeBase = `No se pudo actualizar ${que} de ${primeraFallida.repoName}: ${primeraFallida.error}`;
  if (restoDeFallidas.length === 0) return mensajeBase;

  return `${mensajeBase} (y ${restoDeFallidas.length} más)`;
}

export function mensajeDeFallosDeCI(resultado: SincronizarCIResult): string | null {
  return mensajeDeFallos(resultado, "el CI");
}

// Respuesta de `POST /api/assignments/[id]/ci` (issue #122): une el
// resultado de CI (de siempre) con el de participación, sincronizado
// aparte en la misma request. El botón importa sólo este tipo (no las
// funciones de `application`, para no arrastrar lógica de servidor al bundle
// del cliente).
export type RespuestaDeSincronizacion = SincronizarCIResult & {
  participacion: SincronizarParticipacionResult;
};

/**
 * Une el mensaje de fallos de CI y el de participación de una misma
 * respuesta de sincronización. `null` si ninguno de los dos tuvo fallidas.
 */
export function mensajeDeFallosDeSincronizacion(
  respuesta: RespuestaDeSincronizacion
): string | null {
  const mensajes = [
    mensajeDeFallosDeCI(respuesta),
    mensajeDeFallos(respuesta.participacion, "la participación"),
  ].filter((mensaje): mensaje is string => mensaje !== null);

  return mensajes.length === 0 ? null : mensajes.join(" · ");
}
