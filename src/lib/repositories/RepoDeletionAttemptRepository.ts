import { QueryOrder } from "@mikro-orm/core";
import { getEM } from "@/lib/db";
import {
  Entrega,
  RepoDeletionAttempt,
  type RepoDeletionStatus,
} from "@/domain/entities";

export type RepoDeletionHistoryPage = {
  items: RepoDeletionAttempt[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function conLockBorradoReposAssignment<T>(
  assignmentId: string,
  operation: () => Promise<T>
): Promise<T> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    await transaction.getConnection().execute(
      "select pg_advisory_xact_lock(hashtextextended(?, 0))",
      [`repo-deletion:${assignmentId}`]
    );
    return operation();
  });
}

export async function iniciarIntentoBorradoRepo(data: {
  operationId: string;
  assignmentId: string;
  entregaId: string;
  repoName: string;
  requestedBy: string;
}): Promise<RepoDeletionAttempt> {
  const entityManager = await getEM();
  const attempt = new RepoDeletionAttempt();
  Object.assign(attempt, data);
  entityManager.persist(attempt);
  await entityManager.flush();
  return attempt;
}

// Delega en `RepoDeletionAttempt.marcarBorrado`/`marcarYaAusente` y en
// `Entrega.marcarRepoBorrado` (Fase 2 de la auditoría de dominio); acá sólo
// queda cargar las dos entidades, delegar y flushear. Sin
// `eventoActualizadoEn` — este borrado lo inicia Classroom (no un webhook
// de GitHub), así que no hay guard de orden que aplicar.
export async function completarIntentoBorradoRepo(data: {
  attemptId: string;
  entregaId: string;
  status: Exclude<RepoDeletionStatus, "pending" | "failed">;
}): Promise<void> {
  const entityManager = await getEM();
  await entityManager.transactional(async (transaction) => {
    const [attempt, entrega] = await Promise.all([
      transaction.findOneOrFail(RepoDeletionAttempt, { id: data.attemptId }),
      transaction.findOneOrFail(Entrega, { id: data.entregaId }),
    ]);
    attempt.completarComo(data.status);
    entrega.marcarRepoBorrado();
    await transaction.flush();
  });
}

// Delega en `RepoDeletionAttempt.marcarFallido`.
export async function fallarIntentoBorradoRepo(
  attemptId: string,
  error: string
): Promise<void> {
  const entityManager = await getEM();
  const attempt = await entityManager.findOneOrFail(RepoDeletionAttempt, {
    id: attemptId,
  });
  attempt.marcarFallido(error);
  await entityManager.flush();
}

export async function getRepoDeletionHistory(
  assignmentId: string,
  requestedPage: number,
  pageSize = 25
): Promise<RepoDeletionHistoryPage> {
  const entityManager = await getEM();
  const total = await entityManager.count(RepoDeletionAttempt, { assignmentId });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const items = await entityManager.find(
    RepoDeletionAttempt,
    { assignmentId },
    {
      orderBy: { startedAt: QueryOrder.DESC, id: QueryOrder.DESC },
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }
  );
  return { items, page, pageSize, total, totalPages };
}
