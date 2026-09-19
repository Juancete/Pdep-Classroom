import { randomUUID } from "node:crypto";
import { getEntregaPorId, eliminarEntrega } from "@/infrastructure/repositories";
import {
  type Entrega,
  EntregaNoEncontradaError,
  EntregaConProvisionEnCursoError,
} from "@/domain/entities";
import { getRepoInfo } from "@/infrastructure/github";
import { borrarRepositorio } from "./borrarRepositoriosDeAssignment";
import { RepositorioPreexistenteNoAdministradoError } from "./aceptarAssignment";

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
 * `entrega.hasRepo()` NO alcanza para decidir si hay algo que borrar en
 * GitHub: una entrega con provisión `fallida` puede tener el repo ya creado
 * (por ejemplo, `addCollaborators` falló después de `crearEntrega` en
 * `aceptarAssignment.ts`) — borrar sólo la fila en ese caso deja el repo
 * huérfano y, al reintentar aceptar, `reconoceComoPropio` no lo reconoce
 * (otro id de entrega) y revienta con `RepositorioPreexistenteNoAdministradoError`.
 * Por eso, si no hay repo activo pero quedó un `repoName` asignado y sin
 * borrar, se consulta GitHub (`getRepoInfo`) para decidir: si no existe, se
 * borra sólo la fila; si existe y es reconocible como propio de esta
 * entrega, se borra igual que el camino activo; si existe pero no es
 * propio, se aborta sin tocar nada — no es responsabilidad de este borrado
 * arbitrar una colisión con un repo ajeno.
 *
 * Tampoco se puede borrar una entrega cuya provisión está en vuelo
 * (`Entrega.provisionEnCurso()`): otra request puede estar terminando de
 * crear el repo justo en ese momento.
 *
 * Si la entrega tiene un repo activo (o uno preexistente reconocido como
 * propio), primero se intenta borrarlo en GitHub (mismo camino auditado que
 * usa `borrarRepositoriosDeAssignment`, vía `borrarRepositorio`). Si GitHub
 * falla, la fila de la entrega NO se borra — queda disponible para
 * reintentar — y se devuelve el error para mostrarlo en el admin. Sólo se
 * borra la fila cuando el repo ya no existe (borrado o ya estaba ausente) o
 * cuando nunca tuvo uno.
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

  if (entrega.provisionEnCurso()) {
    throw new EntregaConProvisionEnCursoError(entrega.id);
  }

  async function borrarRepoYFila(entregaConRepo: Entrega): Promise<BorrarEntregaResult> {
    const resultado = await borrarRepositorio({
      entrega: entregaConRepo,
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

  if (entrega.hasRepo()) {
    return borrarRepoYFila(entrega);
  }

  if (entrega.repoName && !entrega.repoFueBorrado()) {
    const repo = await getRepoInfo(entrega.repoName);
    if (!repo) {
      await eliminarEntrega(entregaId);
      return { ok: true, repo: "sin-repo" };
    }
    if (entrega.reconoceComoPropio(repo)) {
      return borrarRepoYFila(entrega);
    }
    throw new RepositorioPreexistenteNoAdministradoError(entrega.repoName);
  }

  await eliminarEntrega(entregaId);
  return { ok: true, repo: "sin-repo" };
}
