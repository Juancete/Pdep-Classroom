import { getEM } from "@/lib/db";
import { LockMode } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import {
  Alumno,
  Assignment,
  AssignmentNoDisponibleError,
  Grupo,
  Entrega,
  type RolDeUsuario,
  type NombreResultadoCI,
} from "@/domain/entities";

export async function getEntregas(assignmentId?: string): Promise<Entrega[]> {
  const entityManager = await getEM();
  const where = assignmentId ? { assignment: { id: assignmentId } } : {};
  return entityManager.find(Entrega, where, { populate: ["assignment", "grupo"] });
}

// Conteo puntual vía agregación SQL — a diferencia de getEntregaCountsByAssignment()
// más abajo, no carga las entregas en memoria. Lo usa la guarda de "¿tiene
// entregas?" al despublicar un assignment.
export async function contarEntregasDeAssignment(
  assignmentId: string
): Promise<number> {
  const entityManager = await getEM();
  return entityManager.count(Entrega, { assignment: { id: assignmentId } });
}

// Devuelve todas las entregas de un usuario de una sola query,
// indexadas por assignmentId para lookup O(1) en el template.
export async function getEntregasDeUsuario(
  githubUsername: string
): Promise<Map<string, Entrega>> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(Entrega, {});
  const map = new Map<string, Entrega>();
  const normalized = githubUsername.toLowerCase();
  for (const entrega of entregas) {
    if (entrega.githubUsernames.some((username) => username.toLowerCase() === normalized)) {
      map.set(entrega.assignment.id, entrega);
    }
  }
  return map;
}

export async function getEntregaDeUsuario(
  assignmentId: string,
  githubUsername: string
): Promise<Entrega | null> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(Entrega, { assignment: { id: assignmentId } });
  return (
    entregas.find((entrega) =>
      entrega.githubUsernames.some(
        (username) => username.toLowerCase() === githubUsername.toLowerCase()
      )
    ) ?? null
  );
}

export async function getEntregaPorId(
  entregaId: string,
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  return entityManager.findOne(
    Entrega,
    { id: entregaId },
    { populate: ["assignment"] }
  );
}

export async function getEntregaByRepoName(
  repoName: string,
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  return entityManager.findOne(
    Entrega,
    { repoName },
    { populate: ["assignment", "grupo", "alumno"] }
  );
}

// Id numérico de GitHub del repo (issue #60) — a diferencia del nombre, no
// cambia con un rename. Ver `Entrega.repoGithubId`.
export async function getEntregaPorRepoGithubId(
  repoGithubId: string,
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  return entityManager.findOne(
    Entrega,
    { repoGithubId },
    { populate: ["assignment", "grupo", "alumno"] }
  );
}

// Autocompleta `repoGithubId` la primera vez que se conoce (self-heal) —
// no hace falta poblarlo al crear la entrega, se toma del primer webhook
// que llegue para ese repo. Idempotente: si ya está seteado, no hace nada.
export async function asegurarRepoGithubId(
  entregaId: string,
  repoGithubId: string
): Promise<void> {
  const entityManager = await getEM();
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (entrega.repoGithubId) return;
  entrega.repoGithubId = repoGithubId;
  await entityManager.flush();
}

export async function getEntregaLogica(
  data: {
    assignmentId: string;
    alumnoId?: string;
    grupoId?: string;
  },
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  if (data.grupoId) {
    return entityManager.findOne(
      Entrega,
      { assignment: { id: data.assignmentId }, grupo: { id: data.grupoId } },
      { populate: ["assignment", "grupo", "alumno"] }
    );
  }
  if (data.alumnoId) {
    return entityManager.findOne(
      Entrega,
      { assignment: { id: data.assignmentId }, alumno: { id: data.alumnoId } },
      { populate: ["assignment", "grupo", "alumno"] }
    );
  }
  return null;
}

// Devuelve el conteo de entregas por assignmentId en una sola query.
export async function getEntregaCountsByAssignment(): Promise<Map<string, number>> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(Entrega, {}, { fields: ["assignment"] });
  const map = new Map<string, number>();
  for (const entrega of entregas) {
    const assignmentId = entrega.assignment.id;
    map.set(assignmentId, (map.get(assignmentId) ?? 0) + 1);
  }
  return map;
}

export async function getActiveRepoCountsByAssignment(): Promise<Map<string, number>> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(
    Entrega,
    { repoDeleted: false },
    { fields: ["assignment", "repoName"] }
  );
  const map = new Map<string, number>();
  for (const entrega of entregas) {
    if (!entrega.repoName) continue;
    const assignmentId = entrega.assignment.id;
    map.set(assignmentId, (map.get(assignmentId) ?? 0) + 1);
  }
  return map;
}

export async function getEntregasConRepoActivo(
  assignmentId: string
): Promise<Entrega[]> {
  const entityManager = await getEM();
  return entityManager.find(Entrega, {
    assignment: { id: assignmentId },
    repoDeleted: false,
    repoName: { $ne: null },
  });
}

// Persiste el resultado de la última consulta de CI (issue #58).
// Sólo actualiza esas columnas, no toca el resto de la entrega. Cada campo
// es tri-estado: omitido/`undefined` conserva el valor ya guardado (ej. al
// pasar a "pendiente" tras pedir un rerun, sin tener todavía un check nuevo
// que reporte), `null` lo limpia explícitamente (ej. al pasar a "sin_ci").
export async function actualizarCIDeEntrega(
  entregaId: string,
  data: {
    resultadoNombre: NombreResultadoCI;
    checkSuiteIds?: string[] | null;
    commitSha?: string | null;
    detalleUrl?: string | null;
    ejecutadoEn?: Date | null;
  },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  entrega.ciResultadoNombre = data.resultadoNombre;
  if (data.checkSuiteIds !== undefined) entrega.ciCheckSuiteIds = data.checkSuiteIds ?? [];
  if (data.commitSha !== undefined) entrega.ciCommitSha = data.commitSha ?? undefined;
  if (data.detalleUrl !== undefined) entrega.ciDetalleUrl = data.detalleUrl ?? undefined;
  if (data.ejecutadoEn !== undefined) entrega.ciEjecutadoEn = data.ejecutadoEn ?? undefined;
  entrega.ciActualizadoEn = new Date();
  await entityManager.flush();
}

/**
 * Serializa el trabajo protegido del webhook sobre una misma entrega bajo un
 * advisory lock transaccional — mismo mecanismo que
 * `conLockBorradoReposAssignment`. La operación recibe el `EntityManager` de
 * ESA transacción y debe usarlo para las lecturas/escrituras protegidas; así
 * el lock y el read-modify-write comparten conexión y frontera atómica.
 */
export async function conLockDeEntrega<T>(
  entregaId: string,
  operation: (transaction: EntityManager) => Promise<T>
): Promise<T> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    await transaction
      .getConnection()
      .execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", [`ci:${entregaId}`]);
    return operation(transaction);
  });
}

// Actividad reciente del repo (issue #60) — la escribe el webhook de `push`.
// Guard de orden: un redelivery tardío de un push viejo no puede pisar uno
// más nuevo, así que se compara contra lo que ya está guardado antes de
// escribir.
export async function actualizarActividadDeEntrega(
  entregaId: string,
  data: { pusheadoEn: Date; commitSha: string; por: string },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (entrega.ultimoPushEn && entrega.ultimoPushEn >= data.pusheadoEn) return;
  entrega.ultimoPushEn = data.pusheadoEn;
  entrega.ultimoPushSha = data.commitSha;
  entrega.ultimoPushPor = data.por;
  await entityManager.flush();
}

// `true` sólo si un evento `repository` con fecha `eventoActualizadoEn` es
// ESTRICTAMENTE más viejo que el último ya aplicado — GitHub no garantiza
// el orden de entrega, así que un `deleted`/`renamed` demorado no puede
// pisar uno más nuevo que ya se procesó. Sin fecha (payload sin
// `updated_at`), nunca se considera viejo — se aplica igual, mismo criterio
// defensivo que el fallback de `push` cuando falta el timestamp.
//
// Comparación estricta (`>`, no `>=`): `repository.updated_at` viaja en
// segundos, así que dos operaciones sobre el mismo repo dentro del mismo
// segundo (ej. un rename seguido de inmediato por un delete) comparten
// timestamp. Con `>=`, si el rename se procesa primero, el delete
// "empatado" se rechazaría por viejo y el repo quedaría marcado como
// activo pese a haberse borrado — un resultado peor que simplemente dejar
// ganar al que se procesó último en un empate genuino.
function esEventoRepositoryViejo(entrega: Entrega, eventoActualizadoEn?: Date): boolean {
  return Boolean(
    eventoActualizadoEn &&
      entrega.repoEventoActualizadoEn &&
      entrega.repoEventoActualizadoEn > eventoActualizadoEn
  );
}

// El webhook de `repository.deleted` (issue #60) — mismo campo que ya
// escribe `completarIntentoBorradoRepo` cuando el borrado lo inicia
// Classroom, así que la grilla de entregas no necesita distinguir el origen.
export async function marcarRepoBorrado(
  entregaId: string,
  eventoActualizadoEn?: Date,
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (esEventoRepositoryViejo(entrega, eventoActualizadoEn)) return;
  entrega.repoDeleted = true;
  if (eventoActualizadoEn) entrega.repoEventoActualizadoEn = eventoActualizadoEn;
  await entityManager.flush();
}

// El webhook de `repository.renamed` (issue #60): el repo sigue siendo el
// mismo, sólo cambia de nombre/URL — se busca por el nombre viejo (o por
// `repoGithubId`, ver `getEntregaPorRepoGithubId`) y se reescribe.
export async function renombrarRepoDeEntrega(
  entregaId: string,
  data: { repoName: string; repoUrl: string; eventoActualizadoEn?: Date },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (esEventoRepositoryViejo(entrega, data.eventoActualizadoEn)) return;
  entrega.repoName = data.repoName;
  entrega.repoUrl = data.repoUrl;
  if (data.eventoActualizadoEn) entrega.repoEventoActualizadoEn = data.eventoActualizadoEn;
  await entityManager.flush();
}

// El webhook de `member.added`/`member.removed` (issue #60): reconcilia el
// array denormalizado de colaboradores con acceso al repo.
export async function actualizarColaboradoresDeEntrega(
  entregaId: string,
  data: { agregar?: string; quitar?: string },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  let cambio = false;
  if (data.agregar) {
    const normalizado = data.agregar.toLowerCase();
    if (!entrega.githubUsernames.some((username) => username.toLowerCase() === normalizado)) {
      entrega.githubUsernames = [...entrega.githubUsernames, data.agregar];
      cambio = true;
    }
  }
  if (data.quitar) {
    const normalizado = data.quitar.toLowerCase();
    const actualizados = entrega.githubUsernames.filter(
      (username) => username.toLowerCase() !== normalizado
    );
    if (actualizados.length !== entrega.githubUsernames.length) {
      entrega.githubUsernames = actualizados;
      cambio = true;
    }
  }
  if (cambio) await entityManager.flush();
}

export async function createEntrega(
  data: {
    assignmentId: string;
    repoName: string;
    repoUrl: string;
    githubUsernames: string[];
    alumnoId?: string;
    grupoId?: string;
    // Id numérico de GitHub del repo (issue #60) — capturado al crear el
    // repo desde template (`crearEntrega` en `github.ts`), cuando está
    // disponible. Sin esto, el webhook depende exclusivamente del
    // "self-heal" del primer evento que llegue, lo que deja una ventana
    // real: dos renames del mismo repo entregados fuera de orden ANTES de
    // que cualquier webhook haya podido guardar el id se pierden.
    repoGithubId?: string;
  },
  em?: EntityManager
): Promise<Entrega> {
  const entityManager = em ?? (await getEM());

  const assignment = await entityManager.findOneOrFail(Assignment, { id: data.assignmentId });

  const entrega = new Entrega();
  entrega.assignment = assignment;
  entrega.repoName = data.repoName;
  entrega.repoUrl = data.repoUrl;
  entrega.githubUsernames = data.githubUsernames;
  entrega.repoGithubId = data.repoGithubId;

  if (data.alumnoId) {
    entrega.alumno = entityManager.getReference(Alumno, data.alumnoId);
  }

  if (data.grupoId) {
    entrega.grupo = entityManager.getReference(Grupo, data.grupoId);
  }

  entityManager.persist(entrega);
  await entityManager.flush();
  return entrega;
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = extractDbErrorCode(error);
  return code === UNIQUE_VIOLATION || /unique constraint|duplicate key/i.test(error.message);
}

async function findExistingEntrega(
  data: {
    assignmentId: string;
    repoName: string;
    alumnoId?: string;
    grupoId?: string;
  },
  em?: EntityManager
): Promise<Entrega | null> {
  const entrega = await getEntregaByRepoName(data.repoName, em);
  if (entrega?.assignment?.id === data.assignmentId) return entrega;

  return getEntregaLogica(
    {
      assignmentId: data.assignmentId,
      alumnoId: data.alumnoId,
      grupoId: data.grupoId,
    },
    em
  );
}

export async function createOrGetEntrega(
  data: {
    assignmentId: string;
    repoName: string;
    repoUrl: string;
    githubUsernames: string[];
    alumnoId?: string;
    grupoId?: string;
    repoGithubId?: string;
  },
  em?: EntityManager
): Promise<Entrega> {
  const existing = await findExistingEntrega(data, em);
  if (existing) return existing;

  try {
    return await createEntrega(data, em);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const reconciled = await findExistingEntrega(data, em);
    if (reconciled) return reconciled;
    throw error;
  }
}

/**
 * Crea la entrega dentro de una transacción que primero bloquea el
 * assignment (mismo LockMode que cambiarEstadoAssignment) y vuelve a validar
 * que el estado siga habilitando la aceptación. Cierra la ventana entre el
 * chequeo inicial de aceptarAssignment (antes de las llamadas a GitHub, que
 * no pueden vivir dentro de una transacción de DB) y la persistencia final:
 * si un admin despublica el assignment mientras un alumno lo está aceptando,
 * quien llegue segundo a este lock ve el estado real y actúa en consecuencia.
 */
export async function crearEntregaSiAssignmentDisponible(
  data: {
    assignmentId: string;
    repoName: string;
    repoUrl: string;
    githubUsernames: string[];
    alumnoId?: string;
    grupoId?: string;
    repoGithubId?: string;
  },
  rol: RolDeUsuario
): Promise<Entrega> {
  const entityManager = await getEM();

  return entityManager.transactional(async (transaction) => {
    const assignment = await transaction.findOne(
      Assignment,
      { id: data.assignmentId },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!rol.puedeAdministrar() && !assignment?.permiteAccionesDeAlumno()) {
      throw new AssignmentNoDisponibleError(data.assignmentId);
    }

    return createOrGetEntrega(data, transaction);
  });
}
