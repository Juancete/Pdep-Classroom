import { mapConConcurrenciaLimitada } from "@/lib/concurrencia";
import type { Entrega } from "@/domain/entities";

// Único tope de concurrencia para todo lo que se sincroniza contra GitHub
// por lote (CI, issue #58; participación, issue #122): ambos comparten el
// mismo presupuesto de solicitudes simultáneas.
export const MAX_CONCURRENT_GITHUB_SYNC = 5;

export type SincronizarLoteResult = {
  actualizadas: number;
  omitidas: number;
  fallidas: { repoName: string; error: string }[];
};

export type ResultadoDeUna = "actualizada" | { error: string };

/**
 * Ciclo común a toda sincronización por lote contra GitHub (issue #122,
 * extraído de `sincronizarCI.sincronizarCIDeEntregas`): filtra las entregas
 * con repo activo que no estén frescas (según `estaFresca`, salvo
 * `forzar: true`), les aplica `sincronizarUna` con
 * `MAX_CONCURRENT_GITHUB_SYNC` de concurrencia y separa el resultado en
 * `actualizadas`/`omitidas`/`fallidas`. Un fallo puntual de `sincronizarUna`
 * no aborta el lote: queda registrado en `fallidas` con el `repoName` y las
 * demás entregas siguen su curso.
 */
export async function sincronizarLoteDeEntregas(
  entregas: Entrega[],
  opts: {
    forzar: boolean;
    estaFresca: (entrega: Entrega, ahora: Date) => boolean;
    sincronizarUna: (entrega: Entrega) => Promise<ResultadoDeUna>;
  }
): Promise<SincronizarLoteResult> {
  const ahora = new Date();
  const pendientes = entregas.filter(
    (entrega) => entrega.hasRepo() && (opts.forzar || !opts.estaFresca(entrega, ahora))
  );
  const omitidas = entregas.length - pendientes.length;

  const resultados = await mapConConcurrenciaLimitada(
    pendientes,
    MAX_CONCURRENT_GITHUB_SYNC,
    opts.sincronizarUna
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
