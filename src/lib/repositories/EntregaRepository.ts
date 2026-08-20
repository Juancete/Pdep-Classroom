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
  }
): Promise<void> {
  const entityManager = await getEM();
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  entrega.ciResultadoNombre = data.resultadoNombre;
  if (data.checkSuiteIds !== undefined) entrega.ciCheckSuiteIds = data.checkSuiteIds ?? [];
  if (data.commitSha !== undefined) entrega.ciCommitSha = data.commitSha ?? undefined;
  if (data.detalleUrl !== undefined) entrega.ciDetalleUrl = data.detalleUrl ?? undefined;
  if (data.ejecutadoEn !== undefined) entrega.ciEjecutadoEn = data.ejecutadoEn ?? undefined;
  entrega.ciActualizadoEn = new Date();
  await entityManager.flush();
}

export async function createEntrega(
  data: {
    assignmentId: string;
    repoName: string;
    repoUrl: string;
    githubUsernames: string[];
    alumnoId?: string;
    grupoId?: string;
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
