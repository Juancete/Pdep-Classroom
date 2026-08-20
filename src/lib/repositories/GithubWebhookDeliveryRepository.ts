import { getEM } from "@/lib/db";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { GithubWebhookDelivery, type NombreEstadoDelivery } from "@/domain/entities";

/**
 * El delivery ya existe (choca contra el índice único de `deliveryId`).
 * `recibirDeliveryDeGithub` lo usa para intentar reclamar la fila existente
 * en vez de asumir directamente que no hay nada para hacer — un redelivery
 * de GitHub llega con el mismo `X-GitHub-Delivery` que el intento original,
 * así que si ese intento había quedado `fallido` (o `recibido` sin cerrar),
 * el redelivery es la oportunidad real de reprocesarlo.
 */
export class DeliveryDuplicadoError extends Error {
  constructor(public readonly deliveryId: string) {
    super(`El delivery ${deliveryId} ya fue recibido`);
    this.name = "DeliveryDuplicadoError";
  }
}

// Ventana para tratar un `procesando` como huérfano y volver a ofrecerlo
// para reclamo: sólo pasa si la lambda que lo reclamó murió a mitad de
// camino sin llegar a cerrar la fila (crash, timeout de la plataforma). El
// procesamiento normal termina en milisegundos/segundos, así que 2 minutos
// da margen de sobra sin dejar una fila realmente en vuelo disponible para
// un segundo reclamo.
const VENTANA_PROCESANDO_HUERFANO_MS = 120_000;

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = extractDbErrorCode(error);
  return code === UNIQUE_VIOLATION || /unique constraint|duplicate key/i.test(error.message);
}

export async function registrarDelivery(data: {
  deliveryId: string;
  evento: string;
  accion?: string;
  repoName?: string;
  payload: unknown;
}): Promise<GithubWebhookDelivery> {
  const entityManager = await getEM();
  const delivery = new GithubWebhookDelivery();
  delivery.deliveryId = data.deliveryId;
  delivery.evento = data.evento;
  delivery.accion = data.accion;
  delivery.repoName = data.repoName;
  delivery.payload = data.payload;
  entityManager.persist(delivery);
  try {
    await entityManager.flush();
  } catch (error) {
    if (isUniqueViolation(error)) throw new DeliveryDuplicadoError(data.deliveryId);
    throw error;
  }
  return delivery;
}

export type DeliveryReclamado = {
  id: string;
  deliveryId: string;
  evento: string;
  payload: unknown;
};

/**
 * Reclama atómicamente una fila para procesarla: `recibido`/`fallido` (o un
 * `procesando` huérfano) pasan a `procesando` en el mismo `UPDATE`, y sólo
 * quien reclamó de verdad recibe la fila de vuelta. Dos llamadas
 * concurrentes sobre la misma fila (un redelivery de GitHub cruzándose con
 * un reproceso admin, o dos reprocesos admin en simultáneo) sólo dejan
 * ganar a una — la otra recibe `null` y no reaplica nada. Es la garantía
 * atómica que un `SELECT` seguido de un `UPDATE` separado no puede dar.
 *
 * El vencimiento del `procesando` huérfano se mide contra `reclamado_en`
 * (cuándo se ganó ESTE reclamo), no contra `recibido_en` (cuándo se
 * insertó la fila originalmente): un delivery `fallido` puede tener
 * `recibido_en` de hace horas, y compararlo con eso dejaría a un
 * `procesando` recién ganado disponible para un segundo reclamo de
 * inmediato — el lease nacería "vencido".
 */
async function reclamar(where: string, params: unknown[]): Promise<DeliveryReclamado | null> {
  const entityManager = await getEM();
  const rows = await entityManager.getConnection().execute<DeliveryReclamado[]>(
    `update "github_webhook_delivery"
       set "estado_procesamiento" = 'procesando', "intentos" = "intentos" + 1, "reclamado_en" = now()
       where ${where}
         and (
           "estado_procesamiento" in ('recibido', 'fallido')
           or (
             "estado_procesamiento" = 'procesando'
             and "reclamado_en" < now() - (interval '1 millisecond' * ?)
           )
         )
       returning "id", "delivery_id" as "deliveryId", "evento", "payload"`,
    [...params, VENTANA_PROCESANDO_HUERFANO_MS]
  );
  return rows[0] ?? null;
}

export async function reclamarDeliveryPorId(id: string): Promise<DeliveryReclamado | null> {
  return reclamar(`"id" = ?`, [id]);
}

/**
 * Igual que `reclamarDeliveryPorId`, pero por `X-GitHub-Delivery` — lo usa
 * `recibirDeliveryDeGithub` cuando el insert choca contra el índice único
 * (`DeliveryDuplicadoError`): en vez de asumir "ya se manejó", intenta
 * reclamar la fila existente por su `deliveryId` real.
 */
export async function reclamarDeliveryPorDeliveryId(
  deliveryId: string
): Promise<DeliveryReclamado | null> {
  return reclamar(`"delivery_id" = ?`, [deliveryId]);
}

// Cierra en un estado terminal exitoso — limpia el payload: `procesado` e
// `ignorado` no se vuelven a reprocesar, no hace falta conservarlo (acota
// el crecimiento de la tabla y la retención de PII de los payloads de `push`).
export async function cerrarDelivery(
  id: string,
  data: {
    estadoNombre: Extract<NombreEstadoDelivery, "procesado" | "ignorado">;
    entregaId?: string;
  }
): Promise<void> {
  const entityManager = await getEM();
  const delivery = await entityManager.findOneOrFail(GithubWebhookDelivery, { id });
  delivery.estadoProcesamiento = data.estadoNombre;
  delivery.entregaId = data.entregaId;
  delivery.procesadoEn = new Date();
  delivery.payload = null;
  delivery.error = null;
  await entityManager.flush();
}

// Cierra en `fallido` conservando el payload — es lo que necesita
// `reclamarDeliveryPorId`/`reclamarDeliveryPorDeliveryId` para volver a
// ofrecerlo para reclamo.
export async function fallarDelivery(id: string, error: string): Promise<void> {
  const entityManager = await getEM();
  const delivery = await entityManager.findOneOrFail(GithubWebhookDelivery, { id });
  delivery.estadoProcesamiento = "fallido";
  delivery.procesadoEn = new Date();
  delivery.error = error;
  await entityManager.flush();
}

// IDs de deliveries candidatos a reprocesar: `recibido`/`fallido`, o un
// `procesando` que quedó huérfano (ver `VENTANA_PROCESANDO_HUERFANO_MS`).
// Sólo devuelve IDs — el reproceso real re-lee evento/payload al reclamar
// cada uno atómicamente, así que no importa si esta lista queda desalineada
// un instante después de leída (dos reprocesos concurrentes eligiendo el
// mismo candidato: el segundo reclamo simplemente no gana nada).
export async function getDeliveriesReprocesables(
  deliveryId?: string,
  limit = 50
): Promise<string[]> {
  const entityManager = await getEM();
  const staleCutoff = new Date(Date.now() - VENTANA_PROCESANDO_HUERFANO_MS);
  const estadoCondition = {
    $or: [
      { estadoProcesamiento: { $in: ["recibido", "fallido"] as NombreEstadoDelivery[] } },
      { estadoProcesamiento: "procesando" as NombreEstadoDelivery, reclamadoEn: { $lt: staleCutoff } },
    ],
  };
  const where = deliveryId ? { deliveryId, ...estadoCondition } : estadoCondition;
  const deliveries = await entityManager.find(GithubWebhookDelivery, where, {
    orderBy: { recibidoEn: "asc" },
    limit,
    fields: ["id"],
  });
  return deliveries.map((delivery) => delivery.id);
}
