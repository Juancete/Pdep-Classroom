import { getContribuciones, type ClienteAcotadoDeGithub } from "@/infrastructure/github";
import { logger } from "@/lib/logger";
import { mensajeOperativo } from "@/lib/mensaje-operativo";
import { actualizarContribucionesDeEntrega } from "@/infrastructure/repositories";
import type { Entrega } from "@/domain/entities";
import type { EntityManager } from "@mikro-orm/postgresql";
import {
  sincronizarLoteDeEntregas,
  type ResultadoDeUna,
  type SincronizarLoteResult,
} from "./sincronizarLote";

export type SincronizarParticipacionResult = SincronizarLoteResult;

async function sincronizarUna(
  entrega: Entrega,
  em?: EntityManager,
  github?: ClienteAcotadoDeGithub
): Promise<ResultadoDeUna> {
  const repoName = entrega.repoName!;
  try {
    const contribuciones = await getContribuciones(repoName, github);
    await actualizarContribucionesDeEntrega(entrega.id, contribuciones, em);
    return "actualizada";
  } catch (error) {
    const message = mensajeOperativo(error);
    logger.error(
      { err: message, entregaId: entrega.id, repoName },
      "No se pudo sincronizar la participación"
    );
    return { error: message };
  }
}

/**
 * Consulta en GitHub los contribuidores de cada entrega con repo activo y
 * los cachea en la propia `Entrega` (issue #122). Función hermana de
 * `sincronizarCI.sincronizarCIDeEntregas`, no una que corra dentro de ella:
 * un fallo al consultar contributors no debe marcar la entrega como
 * `fallida` de CI. Nadie la llama bajo el lock de webhook con presupuesto
 * acotado (issue #125) — sólo la route de "Actualizar" del panel docente.
 */
export async function sincronizarParticipacionDeEntregas(
  entregas: Entrega[],
  opts?: { forzar?: boolean; em?: EntityManager; github?: ClienteAcotadoDeGithub }
): Promise<SincronizarParticipacionResult> {
  return sincronizarLoteDeEntregas(entregas, {
    forzar: opts?.forzar ?? false,
    estaFresca: (entrega, ahora) => entrega.tieneContribucionesFrescas(ahora),
    sincronizarUna: (entrega) => sincronizarUna(entrega, opts?.em, opts?.github),
  });
}
