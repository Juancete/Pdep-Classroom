import { randomUUID } from "node:crypto";
import { deleteRepo, type DeleteRepoResult } from "@/infrastructure/github";
import { logger } from "@/lib/logger";
import { mapConConcurrenciaLimitada } from "@/lib/concurrencia";
import { mensajeOperativo } from "@/lib/mensaje-operativo";
import {
  completarIntentoBorradoRepo,
  fallarIntentoBorradoRepo,
  getAssignment,
  getEntregasConRepoActivo,
  iniciarIntentoBorradoRepo,
} from "@/infrastructure/repositories";
import {
  AssignmentNoArchivadoError,
  AssignmentNoEncontradoError,
  type Entrega,
} from "@/domain/entities";
import type { EntityManager } from "@mikro-orm/postgresql";

const MAX_CONCURRENT_DELETIONS = 5;

export type RepoDeletionItemResult = {
  entregaId: string;
  repoName: string;
  status: "deleted" | "already_absent" | "failed";
  error?: string;
};

export type DeleteAssignmentReposResult = {
  ok: boolean;
  operationId: string | null;
  attempted: number;
  deleted: number;
  alreadyAbsent: number;
  failed: number;
  results: RepoDeletionItemResult[];
};

export async function borrarRepositorio(data: {
  entrega: Entrega;
  assignmentId: string;
  operationId: string;
  requestedBy: string;
}): Promise<RepoDeletionItemResult> {
  const { entrega, assignmentId, operationId, requestedBy } = data;
  const repoName = entrega.repoName!;
  let attemptId: string;

  try {
    const attempt = await iniciarIntentoBorradoRepo({
      operationId,
      assignmentId,
      entregaId: entrega.id,
      repoName,
      requestedBy,
    });
    attemptId = attempt.id;
  } catch (error) {
    logger.error(
      {
        err: mensajeOperativo(error),
        operationId,
        assignmentId,
        entregaId: entrega.id,
        repoName,
        requestedBy,
      },
      "No se pudo iniciar la auditoría de borrado del repositorio"
    );
    return {
      entregaId: entrega.id,
      repoName,
      status: "failed",
      error: "No se pudo registrar el inicio del borrado. Reintentá.",
    };
  }

  let githubResult: DeleteRepoResult;
  try {
    githubResult = await deleteRepo(repoName);
  } catch (error) {
    const message = mensajeOperativo(error);
    try {
      await fallarIntentoBorradoRepo(attemptId, message);
    } catch (auditError) {
      logger.error(
        { err: mensajeOperativo(auditError), attemptId, operationId, assignmentId, repoName },
        "No se pudo persistir el fallo del borrado"
      );
    }
    logger.error(
      { err: message, attemptId, operationId, assignmentId, repoName, requestedBy },
      "Falló el borrado del repositorio"
    );
    return { entregaId: entrega.id, repoName, status: "failed", error: message };
  }

  try {
    await completarIntentoBorradoRepo({
      attemptId,
      entregaId: entrega.id,
      status: githubResult,
    });
  } catch (error) {
    const persistenceError =
      "GitHub respondió, pero no se pudo guardar el resultado. Reintentá.";
    logger.error(
      {
        err: mensajeOperativo(error),
        attemptId,
        operationId,
        assignmentId,
        repoName,
        requestedBy,
        githubResult,
      },
      "GitHub respondió al borrado, pero no se pudo persistir el resultado"
    );
    try {
      await fallarIntentoBorradoRepo(attemptId, persistenceError);
    } catch (auditError) {
      logger.error(
        { err: mensajeOperativo(auditError), attemptId, operationId, assignmentId, repoName },
        "No se pudo cerrar como fallido el intento de borrado"
      );
    }
    return {
      entregaId: entrega.id,
      repoName,
      status: "failed",
      error: persistenceError,
    };
  }

  logger.info(
    { attemptId, operationId, assignmentId, repoName, requestedBy, status: githubResult },
    "Borrado de repositorio registrado"
  );
  return { entregaId: entrega.id, repoName, status: githubResult };
}

/**
 * `em` es la transacción que sostiene `conLockBorradoReposAssignment` y se usa
 * SÓLO para lo que hay que leer bajo el lock: el estado del assignment y el
 * listado de repos a borrar. El borrado de cada repo y su auditoría usan sus
 * propios `EntityManager` (ver el docblock del lock: van de a
 * `MAX_CONCURRENT_DELETIONS` en paralelo y la auditoría se commitea aparte a
 * propósito), por eso `em` no se reenvía a `borrarRepositorio`.
 */
export async function borrarRepositoriosDeAssignment(data: {
  assignmentId: string;
  requestedBy: string;
  em?: EntityManager;
}): Promise<DeleteAssignmentReposResult> {
  const { em, ...datosDeBorrado } = data;

  // La route valida el estado ANTES de adquirir el lock; se revalida acá, ya
  // adentro, para no actuar con una validación anterior a la adquisición. No
  // serializa por sí sola cambios posteriores del ciclo de vida del assignment.
  const assignment = await getAssignment(datosDeBorrado.assignmentId, em);
  if (!assignment) throw new AssignmentNoEncontradoError(datosDeBorrado.assignmentId);
  if (!assignment.permiteBorrarRepos()) {
    throw new AssignmentNoArchivadoError(datosDeBorrado.assignmentId);
  }

  const entregas = await getEntregasConRepoActivo(datosDeBorrado.assignmentId, em);
  if (entregas.length === 0) {
    return {
      ok: true,
      operationId: null,
      attempted: 0,
      deleted: 0,
      alreadyAbsent: 0,
      failed: 0,
      results: [],
    };
  }

  const operationId = randomUUID();
  const results = await mapConConcurrenciaLimitada(
    entregas,
    MAX_CONCURRENT_DELETIONS,
    (entrega) => borrarRepositorio({ ...datosDeBorrado, entrega, operationId })
  );
  const deleted = results.filter((result) => result.status === "deleted").length;
  const alreadyAbsent = results.filter(
    (result) => result.status === "already_absent"
  ).length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    ok: failed === 0,
    operationId,
    attempted: results.length,
    deleted,
    alreadyAbsent,
    failed,
    results,
  };
}
