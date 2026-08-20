import { Entity, Enum, Index, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { EstadoDelivery, NOMBRES_ESTADO_DELIVERY, type NombreEstadoDelivery } from "./EstadoDelivery";

/**
 * Auditoría de deliveries de webhook de GitHub (issue #60) — molde:
 * `RepoDeletionAttempt`. Sin FK: la auditoría tiene que sobrevivir al
 * borrado posterior de la entrega o el assignment que referencia.
 *
 * `deliveryId` es único — es la garantía de dedup: un delivery repetido
 * (redelivery de GitHub, o dos lambdas procesando la misma request en una
 * carrera) choca contra el índice único en vez de reaplicar el efecto.
 *
 * `payload` se guarda al recibir y se limpia a `null` al cerrar en
 * `procesado`/`ignorado` — sólo queda persistido en `fallido`/`recibido`,
 * que son los únicos estados que el reproceso necesita volver a aplicar.
 * Acota el crecimiento de la tabla y la retención de PII (un payload de
 * `push` trae emails de committers).
 */
@Entity({ tableName: "github_webhook_delivery" })
@Index({
  name: "github_webhook_delivery_estado_recibido_idx",
  properties: ["estadoProcesamiento", "recibidoEn"],
})
export class GithubWebhookDelivery {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "string", unique: true })
  deliveryId!: string;

  // Header `X-GitHub-Event` (ej. "check_suite", "push", "repository", "member").
  @Property({ type: "string" })
  evento!: string;

  // `payload.action`, cuando el evento lo trae (ej. "completed", "deleted").
  @Property({ type: "string", nullable: true })
  accion?: string;

  @Property({ type: "string", nullable: true })
  repoName?: string;

  // Sin FK a propósito, igual que `RepoDeletionAttempt.entregaId` — se
  // resuelve recién al procesar, y puede quedar sin asignar si el repo no
  // corresponde a ninguna entrega (templates, repo de la app, etc.).
  @Property({ type: "uuid", nullable: true })
  entregaId?: string;

  @Enum({ items: [...NOMBRES_ESTADO_DELIVERY], default: "recibido" })
  estadoProcesamiento: NombreEstadoDelivery = "recibido";

  @Property({ type: "integer", default: 0 })
  intentos: number = 0;

  @Property({ type: "text", nullable: true })
  error?: string;

  @Property({ type: "json", nullable: true })
  payload?: unknown;

  @Property({ type: "datetime" })
  recibidoEn: Date = new Date();

  // Cuándo se reclamó por última vez (transición a `procesando`) — NO es
  // `recibidoEn`: un delivery `fallido` puede tener `recibidoEn` de hace
  // horas, y usar esa fecha para el lease dejaría a un `procesando` recién
  // reclamado disponible para un segundo reclamo de inmediato (el lease
  // quedaría "vencido" desde el instante cero). El vencimiento del lease se
  // mide desde acá.
  @Property({ type: "datetime", nullable: true })
  reclamadoEn?: Date;

  @Property({ type: "datetime", nullable: true })
  procesadoEn?: Date;

  get estado(): EstadoDelivery {
    return EstadoDelivery.desdeNombre(this.estadoProcesamiento);
  }
}
