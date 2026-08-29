import { getEM } from "@/lib/db";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import {
  GithubWebhookDelivery,
  VENTANA_PROCESANDO_HUERFANO_MS,
  type NombreEstadoDelivery,
} from "@/domain/entities";

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
 *
 * El `where` del `case` de abajo (`recibido`/`fallido`, o `procesando` con
 * lease vencido) es el filtro grueso equivalente en SQL a
 * `GithubWebhookDelivery.puedeReprocesarse()` (Fase 2 de la auditoría de
 * dominio) — se mantiene set-based a propósito: un load-then-save por acá
 * no puede dar la misma garantía atómica que este único `UPDATE ...
 * RETURNING` contra reclamos concurrentes sobre la misma fila.
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

// Cierra en un estado terminal exitoso — delega en
// `GithubWebhookDelivery.cerrarComoProcesado`/`cerrarComoIgnorado` (Fase 2
// de la auditoría de dominio); acá sólo queda cargar, delegar y flushear.
export async function cerrarDelivery(
  id: string,
  data: {
    estadoNombre: Extract<NombreEstadoDelivery, "procesado" | "ignorado">;
    entregaId?: string;
  }
): Promise<void> {
  const entityManager = await getEM();
  const delivery = await entityManager.findOneOrFail(GithubWebhookDelivery, { id });
  delivery.cerrarComo(data.estadoNombre, data.entregaId);
  await entityManager.flush();
}

// Cierra en `fallido` conservando el payload — es lo que necesita
// `reclamarDeliveryPorId`/`reclamarDeliveryPorDeliveryId` para volver a
// ofrecerlo para reclamo. Delega en `GithubWebhookDelivery.fallar`.
export async function fallarDelivery(id: string, error: string): Promise<void> {
  const entityManager = await getEM();
  const delivery = await entityManager.findOneOrFail(GithubWebhookDelivery, { id });
  delivery.fallar(error);
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

export type WebhookDeliveryOverview = {
  pendientes: number;
  fallidos: number;
  ultimoRecibidoEn: Date | null;
  items: Array<{
    id: string;
    deliveryId: string;
    evento: string;
    accion?: string;
    repoName?: string;
    estadoProcesamiento: NombreEstadoDelivery;
    intentos: number;
    error: string | null;
    recibidoEn: Date;
    // Única fuente para el botón de reproceso del panel admin (B5 de la
    // auditoría de dominio): antes la UI decidía sola con
    // `["fallido", "recibido"].includes(estadoProcesamiento)`, sin conocer
    // el caso "procesando huérfano" (lease vencido) que el backend sí
    // reprocesa — ver `GithubWebhookDelivery.puedeReprocesarse`.
    puedeReprocesarse: boolean;
  }>;
};

export async function getWebhookDeliveryOverview(limit = 50): Promise<WebhookDeliveryOverview> {
  const entityManager = await getEM();
  const ahora = new Date();
  const [deliveries, pendientes, fallidos] = await Promise.all([
    entityManager.find(GithubWebhookDelivery, {}, {
      orderBy: { recibidoEn: "desc" },
      limit,
      fields: [
        "id",
        "deliveryId",
        "evento",
        "accion",
        "repoName",
        "estadoProcesamiento",
        "intentos",
        "error",
        "recibidoEn",
        "reclamadoEn",
      ],
    }),
    entityManager.count(GithubWebhookDelivery, {
      estadoProcesamiento: { $in: ["recibido", "procesando"] },
    }),
    entityManager.count(GithubWebhookDelivery, { estadoProcesamiento: "fallido" }),
  ]);
  const items = deliveries.map((delivery) => ({
    id: delivery.id,
    deliveryId: delivery.deliveryId,
    evento: delivery.evento,
    accion: delivery.accion,
    repoName: delivery.repoName,
    estadoProcesamiento: delivery.estadoProcesamiento,
    intentos: delivery.intentos,
    error: delivery.error,
    recibidoEn: delivery.recibidoEn,
    puedeReprocesarse: delivery.puedeReprocesarse(ahora),
  }));
  return {
    items,
    pendientes,
    fallidos,
    ultimoRecibidoEn: items[0]?.recibidoEn ?? null,
  };
}
