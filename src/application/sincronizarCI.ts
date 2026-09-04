import { getEstadoCI, reejecutarCI as reejecutarCIEnGitHub } from "@/infrastructure/github";
import { logger } from "@/lib/logger";
import { mapConConcurrenciaLimitada } from "@/lib/concurrencia";
import { mensajeOperativo } from "@/lib/mensaje-operativo";
import { actualizarCIDeEntrega } from "@/infrastructure/repositories";
import {
  resultadoDesdeCheckRuns,
  ReejecucionCINoDisponibleError,
  type Entrega,
} from "@/domain/entities";
import type { EntityManager } from "@mikro-orm/postgresql";

const MAX_CONCURRENT_CI_CHECKS = 5;

export type SincronizarCIResult = {
  actualizadas: number;
  omitidas: number;
  fallidas: { repoName: string; error: string }[];
};

async function sincronizarUnaEntrega(
  entrega: Entrega,
  em?: EntityManager
): Promise<"actualizada" | { error: string }> {
  const repoName = entrega.repoName!;
  try {
    const estado = await getEstadoCI(repoName);

    if (estado.tipo === "sin_ci") {
      // Limpia explícitamente lo que hubiera de una consulta anterior — acá
      // sí sabemos que no hay ningún check, a diferencia de "pendiente" en
      // `reejecutarCIDeEntrega`, donde se preserva el commit/checks previos.
      await actualizarCIDeEntrega(
        entrega.id,
        {
          resultadoNombre: "sin_ci",
          checkSuiteIds: null,
          commitSha: null,
          detalleUrl: null,
          ejecutadoEn: null,
        },
        em
      );
      return "actualizada";
    }

    const resultado = resultadoDesdeCheckRuns(estado.checkRuns);
    await actualizarCIDeEntrega(
      entrega.id,
      {
        resultadoNombre: resultado.nombre,
        checkSuiteIds: estado.checkSuiteIds,
        commitSha: estado.commitSha,
        detalleUrl: estado.detalleUrl,
        ejecutadoEn: new Date(estado.ejecutadoEn),
      },
      em
    );
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
  opts?: { forzar?: boolean; em?: EntityManager }
): Promise<SincronizarCIResult> {
  const forzar = opts?.forzar ?? false;
  const ahora = new Date();
  const pendientes = entregas.filter(
    (entrega) => entrega.hasRepo() && (forzar || !entrega.tieneCIFresco(ahora))
  );
  const omitidas = entregas.length - pendientes.length;

  const resultados = await mapConConcurrenciaLimitada(
    pendientes,
    MAX_CONCURRENT_CI_CHECKS,
    (entrega) => sincronizarUnaEntrega(entrega, opts?.em)
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
  // Misma fuente que el guard de `ci/rerun/route.ts` — `Entrega.puedeReejecutarCI()`
  // combina el resultado ("reejecutable") con que realmente haya
  // `repoName`/checkSuiteIds guardados. Antes esta condición estaba
  // duplicada acá (con `Error` genérico) y en la route (con
  // `permiteReejecucion()` solo) — un resultado "reejecutable" sin checks
  // guardados pasaba el guard de la route y recién acá explotaba como 500.
  if (!entrega.puedeReejecutarCI()) {
    throw new ReejecucionCINoDisponibleError(entrega.id);
  }
  await reejecutarCIEnGitHub(entrega.repoName!, entrega.ciCheckSuiteIds);
  await actualizarCIDeEntrega(entrega.id, { resultadoNombre: "pendiente" });
}
