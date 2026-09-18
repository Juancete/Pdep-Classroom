import { randomUUID } from "node:crypto";
import { getEntregaPorId, eliminarEntrega } from "@/infrastructure/repositories";
import { EntregaNoEncontradaError } from "@/domain/entities";
import { borrarRepositorio } from "./borrarRepositoriosDeAssignment";

export type BorrarEntregaResult =
  | { ok: true; repo: "deleted" | "already_absent" | "sin-repo" }
  | { ok: false; error: string };

/**
 * Borra una entrega puntual desde admin (issue #107): a diferencia de
 * `borrarRepositoriosDeAssignment` (que borra todos los repos activos de un
 * assignment y exige que esté archivado), esta operación apunta a una sola
 * entrega y NO exige que el assignment esté archivado — el objetivo es poder
 * rehacer la demo (aceptar de nuevo el TP) sobre un assignment publicado, sin
 * pasar por el ciclo completo de archivar/despublicar.
 *
 * Si la entrega tiene un repo activo, primero se intenta borrarlo en GitHub
 * (mismo camino auditado que usa `borrarRepositoriosDeAssignment`, vía
 * `borrarRepositorio`). Si GitHub falla, la fila de la entrega NO se borra —
 * queda disponible para reintentar — y se devuelve el error para mostrarlo en
 * el admin. Sólo se borra la fila cuando el repo ya no existe (borrado o ya
 * estaba ausente) o cuando nunca tuvo uno.
 *
 * `RepoDeletionAttempt.entregaId` se guarda como uuid escalar sin FK (ver su
 * comentario en la entidad), así que borrar la fila de la entrega acá no
 * rompe ese historial de auditoría.
 */
export async function borrarEntrega(data: {
  assignmentId: string;
  entregaId: string;
  requestedBy: string;
}): Promise<BorrarEntregaResult> {
  const { assignmentId, entregaId, requestedBy } = data;

  const entrega = await getEntregaPorId(entregaId);
  if (!entrega || entrega.assignment.id !== assignmentId) {
    throw new EntregaNoEncontradaError(entregaId);
  }

  if (entrega.hasRepo()) {
    const resultado = await borrarRepositorio({
      entrega,
      assignmentId,
      operationId: randomUUID(),
      requestedBy,
    });

    if (resultado.status === "failed") {
      return { ok: false, error: resultado.error ?? "No se pudo borrar el repositorio" };
    }

    await eliminarEntrega(entregaId);
    return { ok: true, repo: resultado.status };
  }

  await eliminarEntrega(entregaId);
  return { ok: true, repo: "sin-repo" };
}
