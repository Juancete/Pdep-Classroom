import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "node:crypto";

export type RepoDeletionStatus =
  | "pending"
  | "deleted"
  | "already_absent"
  | "failed";

@Entity({ tableName: "repo_deletion_attempt" })
@Index({
  name: "repo_deletion_attempt_assignment_started_idx",
  properties: ["assignmentId", "startedAt"],
})
@Index({
  name: "repo_deletion_attempt_operation_idx",
  properties: ["operationId"],
})
@Index({
  name: "repo_deletion_attempt_entrega_started_idx",
  properties: ["entregaId", "startedAt"],
})
export class RepoDeletionAttempt {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "uuid" })
  operationId!: string;

  // Se conservan como IDs escalares, sin FK, para que el historial sobreviva
  // al borrado posterior del assignment o de la entrega.
  @Property({ type: "uuid" })
  assignmentId!: string;

  @Property({ type: "uuid" })
  entregaId!: string;

  @Property({ type: "string" })
  repoName!: string;

  @Property({ type: "string" })
  requestedBy!: string;

  @Enum({
    items: ["pending", "deleted", "already_absent", "failed"],
    default: "pending",
  })
  status: RepoDeletionStatus = "pending";

  @Property({ type: "datetime" })
  startedAt: Date = new Date();

  @Property({ type: "datetime", nullable: true })
  completedAt?: Date;

  @Property({ type: "text", nullable: true })
  error?: string;

  /** Cierra el intento con un resultado exitoso (`deleted`/`already_absent`). */
  completarComo(status: Exclude<RepoDeletionStatus, "pending" | "failed">): void {
    this.status = status;
    this.completedAt = new Date();
    this.error = undefined;
  }

  /** El repo se borró efectivamente en GitHub. */
  marcarBorrado(): void {
    this.completarComo("deleted");
  }

  /** El repo ya no existía en GitHub (idempotente: no es un fallo). */
  marcarYaAusente(): void {
    this.completarComo("already_absent");
  }

  /** El intento de borrado falló — conserva el motivo. */
  marcarFallido(error: string): void {
    this.status = "failed";
    this.completedAt = new Date();
    this.error = error;
  }
}
