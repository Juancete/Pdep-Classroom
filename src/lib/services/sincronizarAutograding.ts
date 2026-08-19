import {
  getUltimaEjecucionAutograding,
  reejecutarAutograding as reejecutarAutogradingEnGitHub,
} from "@/lib/github";
import { logger } from "@/lib/logger";
import { mapConConcurrenciaLimitada } from "@/lib/concurrencia";
import { mensajeOperativo } from "@/lib/mensaje-operativo";
import { actualizarAutogradingDeEntrega } from "@/lib/repositories";
import { resultadoDesdeRun, type Entrega } from "@/domain/entities";

const MAX_CONCURRENT_AUTOGRADING_CHECKS = 5;

// Evita martillar la API de GitHub cuando varias personas abren la misma
// vista casi al mismo tiempo: si ya consultamos hace menos de este umbral,
// no se vuelve a consultar salvo `forzar: true`.
export const FRESCURA_AUTOGRADING_MS = 60_000;

export type SincronizarAutogradingResult = {
  actualizadas: number;
  omitidas: number;
  fallidas: { repoName: string; error: string }[];
};

function esReciente(fecha: Date | undefined): boolean {
  if (!fecha) return false;
  return Date.now() - fecha.getTime() < FRESCURA_AUTOGRADING_MS;
}

async function sincronizarUnaEntrega(entrega: Entrega): Promise<"actualizada" | { error: string }> {
  const repoName = entrega.repoName!;
  try {
    const ejecucion = await getUltimaEjecucionAutograding(repoName);

    if (ejecucion.tipo === "sin_workflow") {
      await actualizarAutogradingDeEntrega(entrega.id, { resultadoNombre: "sin_autograding" });
      return "actualizada";
    }
    if (ejecucion.tipo === "sin_ejecuciones") {
      await actualizarAutogradingDeEntrega(entrega.id, { resultadoNombre: "sin_ejecuciones" });
      return "actualizada";
    }

    const resultado = resultadoDesdeRun(ejecucion);
    await actualizarAutogradingDeEntrega(entrega.id, {
      resultadoNombre: resultado.nombre,
      runId: ejecucion.runId,
      runUrl: ejecucion.runUrl,
      commitSha: ejecucion.commitSha,
      ejecutadoEn: new Date(ejecucion.ejecutadoEn),
    });
    return "actualizada";
  } catch (error) {
    const message = mensajeOperativo(error);
    logger.error(
      { err: error, entregaId: entrega.id, repoName },
      "No se pudo sincronizar el resultado de autograding"
    );
    return { error: message };
  }
}

/**
 * Consulta en GitHub el último resultado de autograding de cada entrega con
 * repo activo y lo cachea en la propia `Entrega`. Un fallo puntual (timeout,
 * rate limit) no aborta el lote ni pisa el resultado previo de esa entrega —
 * queda registrado en `fallidas` y las demás entregas siguen su curso.
 */
export async function sincronizarAutogradingDeEntregas(
  entregas: Entrega[],
  opts?: { forzar?: boolean }
): Promise<SincronizarAutogradingResult> {
  const forzar = opts?.forzar ?? false;
  const pendientes = entregas.filter(
    (entrega) => entrega.hasRepo() && (forzar || !esReciente(entrega.autogradingActualizadoEn))
  );
  const omitidas = entregas.length - pendientes.length;

  const resultados = await mapConConcurrenciaLimitada(
    pendientes,
    MAX_CONCURRENT_AUTOGRADING_CHECKS,
    sincronizarUnaEntrega
  );

  const fallidas: { repoName: string; error: string }[] = [];
  let actualizadas = 0;
  resultados.forEach((resultado, index) => {
    if (resultado === "actualizada") {
      actualizadas++;
    } else {
      fallidas.push({ repoName: pendientes[index]!.repoName!, error: resultado.error });
    }
  });

  return { actualizadas, omitidas, fallidas };
}

/**
 * Pide a GitHub que reejecute la última run conocida de autograding de una
 * entrega y resincroniza esa entrega para reflejar el nuevo estado
 * ("pendiente" mientras corre).
 */
export async function reejecutarAutogradingDeEntrega(entrega: Entrega): Promise<void> {
  if (!entrega.repoName || !entrega.autogradingRunId) {
    throw new Error("No hay una ejecución previa de autograding para reejecutar");
  }
  await reejecutarAutogradingEnGitHub(entrega.repoName, entrega.autogradingRunId);
  await actualizarAutogradingDeEntrega(entrega.id, { resultadoNombre: "pendiente" });
}
