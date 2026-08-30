import { Entity, Enum, Index, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { EstadoDelivery, NOMBRES_ESTADO_DELIVERY, type NombreEstadoDelivery } from "./EstadoDelivery";

// Ventana para tratar un `procesando` como huérfano y volver a ofrecerlo
// para reclamo: sólo pasa si la lambda que lo reclamó murió a mitad de
// camino sin llegar a cerrar la fila (crash, timeout de la plataforma). El
// procesamiento normal termina en milisegundos/segundos, así que 2 minutos
// da margen de sobra sin dejar una fila realmente en vuelo disponible para
// un segundo reclamo. Única fuente: la usan tanto `puedeReprocesarse()` acá
// como el SQL de `GithubWebhookDeliveryRepository.reclamar` — antes vivía
// sólo en el repositorio y la UI del panel admin no la conocía (B5 de la
// auditoría de dominio).
export const VENTANA_PROCESANDO_HUERFANO_MS = 120_000;

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
  error: string | null = null;

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

  /**
   * `true` si tiene sentido ofrecer el reproceso admin de este delivery:
   * `estado.puedeReprocesarse()` (recibido/fallido) o, si quedó `procesando`,
   * que el lease esté vencido (huérfano). Antes esta combinación sólo
   * existía como SQL en `GithubWebhookDeliveryRepository.reclamar`
   * (`puedeReprocesarse()` del estado sola nunca tuvo llamadores) y
   * `admin/operaciones/page.tsx` ofrecía el botón sólo para
   * `["fallido", "recibido"]`, sin el caso "procesando huérfano" — justo el
   * que un admin necesita reprocesar a mano (B5 de la auditoría de dominio).
   */
  puedeReprocesarse(ahora: Date): boolean {
    if (this.estado.puedeReprocesarse()) return true;
    if (this.estadoProcesamiento !== "procesando" || !this.reclamadoEn) return false;
    return ahora.getTime() - this.reclamadoEn.getTime() >= VENTANA_PROCESANDO_HUERFANO_MS;
  }

  /** Cierra el delivery en un estado terminal sin reproceso (`procesado`/`ignorado`). */
  cerrarComo(
    estado: Extract<NombreEstadoDelivery, "procesado" | "ignorado">,
    entregaId?: string
  ): void {
    this.estadoProcesamiento = estado;
    this.entregaId = entregaId;
    this.procesadoEn = new Date();
    // `procesado`/`ignorado` no se vuelven a reprocesar — no hace falta
    // conservar el payload (acota el crecimiento de la tabla y la
    // retención de PII de los payloads de `push`).
    this.payload = null;
    this.error = null;
  }

  /** Cierra en `procesado`: el evento se aplicó con éxito. */
  cerrarComoProcesado(entregaId?: string): void {
    this.cerrarComo("procesado", entregaId);
  }

  /** Cierra en `ignorado`: el evento no requería ninguna acción. */
  cerrarComoIgnorado(entregaId?: string): void {
    this.cerrarComo("ignorado", entregaId);
  }

  /**
   * Cierra en `fallido` conservando el payload — es lo que necesita el
   * reproceso para volver a ofrecerlo para reclamo.
   */
  fallar(error: string): void {
    this.estadoProcesamiento = "fallido";
    this.procesadoEn = new Date();
    this.error = error;
  }
}
