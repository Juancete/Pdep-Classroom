import { getEstadoCI, reejecutarCI as reejecutarCIEnGitHub } from "@/lib/github";
import { logger } from "@/lib/logger";
import { mapConConcurrenciaLimitada } from "@/lib/concurrencia";
import { mensajeOperativo } from "@/lib/mensaje-operativo";
import { actualizarCIDeEntrega } from "@/lib/repositories";
import { resultadoDesdeCheckRuns, type Entrega } from "@/domain/entities";

const MAX_CONCURRENT_CI_CHECKS = 5;

// Evita martillar la API de GitHub cuando varias personas abren la misma
// vista casi al mismo tiempo: si ya consultamos hace menos de este umbral,
// no se vuelve a consultar salvo `forzar: true`.
export const FRESCURA_CI_MS = 60_000;

export type SincronizarCIResult = {
  actualizadas: number;
  omitidas: number;
  fallidas: { repoName: string; error: string }[];
};

function esReciente(fecha: Date | undefined): boolean {
  if (!fecha) return false;
  return Date.now() - fecha.getTime() < FRESCURA_CI_MS;
}

async function sincronizarUnaEntrega(entrega: Entrega): Promise<"actualizada" | { error: string }> {
  const repoName = entrega.repoName!;
  try {
    const estado = await getEstadoCI(repoName);

    if (estado.tipo === "sin_ci") {
      // Limpia explícitamente lo que hubiera de una consulta anterior — acá
      // sí sabemos que no hay ningún check, a diferencia de "pendiente" en
      // `reejecutarCIDeEntrega`, donde se preserva el commit/checks previos.
      await actualizarCIDeEntrega(entrega.id, {
        resultadoNombre: "sin_ci",
        checkSuiteIds: null,
        commitSha: null,
        detalleUrl: null,
        ejecutadoEn: null,
      });
      return "actualizada";
    }

    const resultado = resultadoDesdeCheckRuns(estado.checkRuns);
    await actualizarCIDeEntrega(entrega.id, {
      resultadoNombre: resultado.nombre,
      checkSuiteIds: estado.checkSuiteIds,
      commitSha: estado.commitSha,
      detalleUrl: estado.detalleUrl,
      ejecutadoEn: new Date(estado.ejecutadoEn),
    });
    return "actualizada";
  } catch (error) {
    const message = mensajeOperativo(error);
    logger.error(
      { err: message, entregaId: entrega.id, repoName },
      "No se pudo sincronizar el estado de CI"
    );
    return { error: message };
  }
}

/**
 * Consulta en GitHub el estado combinado de CI de cada entrega con repo
 * activo y lo cachea en la propia `Entrega`. Un fallo puntual (timeout, rate
 * limit) no aborta el lote ni pisa el resultado previo de esa entrega —
 * queda registrado en `fallidas` y las demás entregas siguen su curso.
 */
export async function sincronizarCIDeEntregas(
  entregas: Entrega[],
  opts?: { forzar?: boolean }
): Promise<SincronizarCIResult> {
  const forzar = opts?.forzar ?? false;
  const pendientes = entregas.filter(
    (entrega) => entrega.hasRepo() && (forzar || !esReciente(entrega.ciActualizadoEn))
  );
  const omitidas = entregas.length - pendientes.length;

  const resultados = await mapConConcurrenciaLimitada(
    pendientes,
    MAX_CONCURRENT_CI_CHECKS,
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
 * Pide a GitHub que reejecute (rerequest) los check suites conocidos de una
 * entrega y resincroniza esa entrega para reflejar el nuevo estado
 * ("pendiente" mientras corre).
 */
export async function reejecutarCIDeEntrega(entrega: Entrega): Promise<void> {
  if (!entrega.repoName || entrega.ciCheckSuiteIds.length === 0) {
    throw new Error("No hay checks previos de CI para reejecutar");
  }
  await reejecutarCIEnGitHub(entrega.repoName, entrega.ciCheckSuiteIds);
  await actualizarCIDeEntrega(entrega.id, { resultadoNombre: "pendiente" });
}
