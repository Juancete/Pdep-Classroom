import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import type { OrigenCambioMembresia } from "./RolDeUsuario";

// Única fuente de verdad para los valores de cada enum: el tipo se deriva de
// acá en vez de listarse aparte, para que no puedan desincronizarse entre el
// tipo de TS y los `items` que MikroORM usa para el check constraint.
export const ACCIONES_CAMBIO_MEMBRESIA = ["alta", "baja", "cambio"] as const;
export type AccionCambioMembresia = (typeof ACCIONES_CAMBIO_MEMBRESIA)[number];

const ORIGENES_CAMBIO_MEMBRESIA: readonly OrigenCambioMembresia[] = ["alumno", "docente"];

/**
 * Auditoría de altas, bajas y cambios de integrantes de un grupo (issue #50).
 * Molde: `RepoDeletionAttempt` — los ids son uuid escalares **sin FK**, acá
 * literal y no defensivo: el grupo origen puede desaparecer en la misma
 * transacción que escribe este registro (último integrante que se va de un
 * grupo sin entrega borra el grupo). Si tuviera FK, ese borrado fallaría.
 */
@Entity({ tableName: "cambio_membresia" })
@Index({
  name: "cambio_membresia_assignment_creado_idx",
  properties: ["assignmentId", "creadoEn"],
})
@Index({
  name: "cambio_membresia_alumno_creado_idx",
  properties: ["alumnoId", "creadoEn"],
})
export class CambioDeMembresia {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: "uuid" })
  assignmentId!: string;

  @Property({ type: "uuid" })
  alumnoId!: string;

  // Snapshot: el username del alumno al momento del cambio.
  @Property({ type: "string" })
  alumnoUsername!: string;

  // Snapshots del grupo origen/destino — no son FK, el grupo origen puede
  // haberse borrado (quedó vacío y sin entrega) en la misma transacción.
  @Property({ type: "uuid", nullable: true })
  grupoOrigenId?: string;

  @Property({ type: "string", nullable: true })
  grupoOrigenNombre?: string;

  @Property({ type: "uuid", nullable: true })
  grupoDestinoId?: string;

  @Property({ type: "string", nullable: true })
  grupoDestinoNombre?: string;

  @Enum({ items: [...ACCIONES_CAMBIO_MEMBRESIA] })
  accion!: AccionCambioMembresia;

  // Quién originó el cambio: el propio alumno (self-service) o un docente
  // administrando integrantes. Resuelto por `RolDeUsuario.origenDeAuditoria()`.
  @Enum({ items: [...ORIGENES_CAMBIO_MEMBRESIA] })
  origen!: OrigenCambioMembresia;

  @Property({ type: "string" })
  realizadoPor!: string;

  // Por qué se permitió: si el grupo origen ya tenía entrega, el cambio solo
  // pudo haberlo hecho un docente (un alumno lo tiene bloqueado). Sin
  // inicializador JS a propósito — un valor por default acá esconderría un
  // olvido del caller; `registrarCambioDeMembresia` siempre lo pasa explícito.
  @Property({ type: "boolean" })
  grupoOrigenTeniaEntrega!: boolean;

  // Resolución del grupo vacío: si el grupo origen quedó sin miembros y sin
  // entrega, se borró en la misma transacción.
  @Property({ type: "boolean" })
  grupoOrigenEliminado!: boolean;

  @Property({ type: "text", nullable: true })
  motivo?: string;

  @Property({ type: "datetime" })
  creadoEn: Date = new Date();
}
