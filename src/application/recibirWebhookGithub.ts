import { logger } from "@/lib/logger";
import { mensajeOperativo } from "@/lib/mensaje-operativo";
import { mapConConcurrenciaLimitada } from "@/lib/concurrencia";
import {
  registrarDelivery,
  reclamarDeliveryPorId,
  reclamarDeliveryPorDeliveryId,
  cerrarDelivery,
  fallarDelivery,
  getDeliveriesReprocesables,
  DeliveryDuplicadoError,
  type DeliveryReclamado,
} from "@/infrastructure/repositories";
import { procesarEventoGithub } from "./procesarEventoGithub";

// GitHub limita el tamaño de un delivery de webhook a 25 MB, pero ningún
// payload de los eventos que procesamos (check_suite/push/repository/member)
// se acerca a eso — 1 MiB es margen de sobra y corta payloads anómalos
// temprano, antes de leer el body completo.
export const MAX_WEBHOOK_BODY_BYTES = 1_048_576;

// Concurrencia del reproceso — mismo criterio que `MAX_CONCURRENT_CI_CHECKS`
// en `sincronizarCI.ts` y `MAX_CONCURRENT_DELETIONS` en
// `borrarRepositoriosDeAssignment.ts`. El tope total por llamada (50) lo
// aplica `getDeliveriesReprocesables`.
const MAX_CONCURRENT_REPROCESOS = 5;

export type ResultadoProcesamiento =
  | { tipo: "cerrado"; estado: "procesado" | "ignorado" }
  | { tipo: "fallido"; error: string };

export type ResultadoReclamo =
  | { tipo: "duplicado" }
  | { tipo: "aceptado"; delivery: DeliveryReclamado };

function repoNameDePayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const repository = (payload as { repository?: unknown }).repository;
  if (typeof repository !== "object" || repository === null) return undefined;
  const name = (repository as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function accionDePayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const accion = (payload as { action?: unknown }).action;
  return typeof accion === "string" ? accion : undefined;
}

/**
 * Aplica el efecto de un delivery ya reclamado atómicamente (queda en
 * `procesando` mientras corre esto) y lo cierra en el estado terminal
 * correspondiente. Nunca tira — un fallo de `procesarEventoGithub` (timeout
 * de GitHub, DB caída, etc.) se traduce a `fallido` acá mismo, así que esta
 * función es segura para pasarle a `after()` como fire-and-forget: no deja
 * una promesa rechazada sin manejar. Esa garantía cubre también a
 * `fallarDelivery`: si persistir el fallo también falla (la DB que ya
 * estaba caída sigue caída), ese segundo error se loguea aparte en vez de
 * escapar — la fila queda en `procesando` hasta que venza el lease y
 * vuelva a ofrecerse para reclamo, en vez de perder el log original.
 */
export async function procesarDeliveryReclamado(
  delivery: DeliveryReclamado
): Promise<ResultadoProcesamiento> {
  try {
    const resultado = await procesarEventoGithub(delivery.evento, delivery.payload);
    await cerrarDelivery(delivery.id, {
      estadoNombre: resultado.estado,
      entregaId: resultado.entregaId,
    });
    return { tipo: "cerrado", estado: resultado.estado };
  } catch (error) {
    const mensaje = mensajeOperativo(error);
    // El log usa el `X-GitHub-Delivery` real (lo que acepta
    // `/api/webhooks/github/reprocesar`), no el id interno de la fila —
    // ese queda aparte como `filaId`, útil para debugging en DB pero no
    // para copiar y pegar en un reproceso puntual.
    logger.error(
      { err: mensaje, deliveryId: delivery.deliveryId, filaId: delivery.id, evento: delivery.evento },
      "No se pudo procesar el evento de webhook de GitHub"
    );
    try {
      await fallarDelivery(delivery.id, mensaje);
    } catch (persistError) {
      logger.error(
        {
          err: mensajeOperativo(persistError),
          deliveryId: delivery.deliveryId,
          filaId: delivery.id,
        },
        "No se pudo persistir el fallo del delivery — queda 'procesando' hasta que venza el lease"
      );
    }
    return { tipo: "fallido", error: mensaje };
  }
}

/**
 * Recibe un delivery ya autenticado (firma verificada por el route handler)
 * y lo reclama atómicamente — **no** aplica el efecto: eso lo dispara el
 * caller (el route handler) después de responder, vía `after()` de
 * Next.js, para no bloquear la respuesta con las llamadas a GitHub que
 * puede implicar `procesarEventoGithub` (issue #60: GitHub corta a los 10s
 * si la respuesta tarda; con `after()` seguimos corriendo en la misma
 * invocación serverless sin sumar cola ni cron).
 *
 * El dedup es una restricción de la DB (índice único sobre `deliveryId`), no
 * un `select` previo. Pero un choque contra ese índice NO significa
 * automáticamente "ya se procesó, no hacer nada": GitHub reentrega un
 * delivery con el mismo `X-GitHub-Delivery` (ver "Redeliver" en el README),
 * así que si el intento original quedó en un estado reprocesable
 * (`fallido`, o `recibido`/`procesando` abandonado), este es exactamente el
 * momento de reclamarlo. Sólo se devuelve `duplicado` cuando el reclamo no
 * gana nada — porque ya terminó (`procesado`/`ignorado`) o porque otro
 * proceso lo tiene reclamado en este mismo instante.
 */
export async function reclamarDeliveryEntrante(data: {
  deliveryId: string;
  evento: string;
  payload: unknown;
}): Promise<ResultadoReclamo> {
  let delivery: DeliveryReclamado | null;
  try {
    const registrado = await registrarDelivery({
      deliveryId: data.deliveryId,
      evento: data.evento,
      accion: accionDePayload(data.payload),
      repoName: repoNameDePayload(data.payload),
      payload: data.payload,
    });
    delivery = await reclamarDeliveryPorId(registrado.id);
  } catch (error) {
    if (!(error instanceof DeliveryDuplicadoError)) throw error;
    delivery = await reclamarDeliveryPorDeliveryId(data.deliveryId);
  }

  if (!delivery) return { tipo: "duplicado" };
  return { tipo: "aceptado", delivery };
}

/**
 * Reintenta los deliveries que quedaron en un estado reprocesable —
 * `fallido`, o `recibido`/`procesando` abandonado — a pedido de un admin, o
 * como fallback al `Redeliver` de GitHub. Cada candidato se reclama
 * atómicamente antes de procesarse, así que si dos llamadas se solapan (o
 * se cruzan con un redelivery real de GitHub para el mismo delivery), sólo
 * una efectivamente lo reprocesa.
 */
export async function reprocesarDeliveries(deliveryId?: string): Promise<{
  reprocesados: number;
  cerrados: number;
  fallidos: number;
}> {
  const ids = await getDeliveriesReprocesables(deliveryId);
  const resultados = await mapConConcurrenciaLimitada(ids, MAX_CONCURRENT_REPROCESOS, async (id) => {
    const delivery = await reclamarDeliveryPorId(id);
    if (!delivery) return null; // otro proceso ya lo reclamó primero
    return procesarDeliveryReclamado(delivery);
  });

  const efectivos = resultados.filter(
    (resultado): resultado is ResultadoProcesamiento => resultado !== null
  );
  const cerrados = efectivos.filter((resultado) => resultado.tipo === "cerrado").length;
  const fallidos = efectivos.filter((resultado) => resultado.tipo === "fallido").length;
  return { reprocesados: efectivos.length, cerrados, fallidos };
}
