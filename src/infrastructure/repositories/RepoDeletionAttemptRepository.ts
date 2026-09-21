import { QueryOrder } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { getEM } from "@/infrastructure/db";
import {
  BorradoDeReposEnCursoError,
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

/**
 * Exclusión mutua del borrado masivo de repos de un assignment bajo un advisory
 * lock transaccional (clave `repo-deletion:<assignmentId>`). Si ya hay un
 * borrado en curso, RECHAZA con `BorradoDeReposEnCursoError` en vez de esperar:
 * encolar solicitudes ocuparía conexiones del pool esperando un lock que
 * sostiene quien necesita conexiones nuevas para auditar cada repo.
 *
 * La operación recibe el `EntityManager` de la transacción que sostiene el lock
 * y debe usarlo sólo para lo que tiene que leerse bajo el lock (el listado de
 * repos a borrar). El borrado por repo y su auditoría corren FUERA de esta
 * transacción, con sus propios `EntityManager`: un `EntityManager` no soporta
 * queries concurrentes (el borrado va de a 5 en paralelo) y
 * `iniciarIntentoBorradoRepo` commitea la fila `pending` a propósito — dentro de
 * una única transacción, un fallo borraría la auditoría de repos que GitHub sí
 * borró. Por eso es exclusión mutua entre ejecuciones concurrentes, no una
 * frontera atómica.
 *
 * Sólo serializa contra otros que toman esta misma clave, no contra cambios de
 * ciclo de vida del assignment ni contra el borrado individual de una entrega.
 */
export async function conLockBorradoReposAssignment<T>(
  assignmentId: string,
  operation: (transaction: EntityManager) => Promise<T>
): Promise<T> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    // `transaction.execute(...)` — no `transaction.getConnection().execute(...)`:
    // este último no hereda el contexto de transacción activo y corre en una
    // conexión aparte del pool, así que el lock se tomaría y liberaría al
    // instante sin serializar nada (ver `lockearMembresia` en GrupoRepository).
    const filas = await transaction.execute<{ tomado: boolean }[]>(
      "select pg_try_advisory_xact_lock(hashtextextended(?, 0)) as tomado",
      [`repo-deletion:${assignmentId}`]
    );
    if (!filas[0]!.tomado) throw new BorradoDeReposEnCursoError(assignmentId);
    return operation(transaction);
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
