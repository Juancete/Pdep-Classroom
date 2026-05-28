import { getEM } from "@/lib/db";
import { Alumno, Assignment, Grupo, Entrega } from "@/domain/entities";

export async function getEntregas(assignmentId?: string): Promise<Entrega[]> {
  const entityManager = await getEM();
  const where = assignmentId ? { assignment: { id: assignmentId } } : {};
  return entityManager.find(Entrega, where, { populate: ["assignment", "grupo"] });
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

export async function getEntregaByRepoName(repoName: string): Promise<Entrega | null> {
  const entityManager = await getEM();
  return entityManager.findOne(
    Entrega,
    { repoName },
    { populate: ["assignment", "grupo", "alumno"] }
  );
}

export async function getEntregaLogica(data: {
  assignmentId: string;
  alumnoId?: string;
  grupoId?: string;
}): Promise<Entrega | null> {
  const entityManager = await getEM();
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

export async function clearReposDeAssignment(assignmentId: string): Promise<void> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(Entrega, { assignment: { id: assignmentId } });
  for (const entrega of entregas) {
    entrega.repoDeleted = true;
  }
  await entityManager.flush();
}

export async function createEntrega(data: {
  assignmentId: string;
  repoName: string;
  repoUrl: string;
  githubUsernames: string[];
  alumnoId?: string;
  grupoId?: string;
}): Promise<Entrega> {
  const entityManager = await getEM();

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
  const cause = error.cause;
  const code =
    (error as NodeJS.ErrnoException).code ??
    (cause && typeof cause === "object" ? (cause as NodeJS.ErrnoException).code : undefined);
  return code === "23505" || /unique constraint|duplicate key/i.test(error.message);
}

async function findExistingEntrega(data: {
  assignmentId: string;
  repoName: string;
  alumnoId?: string;
  grupoId?: string;
}): Promise<Entrega | null> {
  const entrega = await getEntregaByRepoName(data.repoName);
  if (entrega?.assignment?.id === data.assignmentId) return entrega;

  return getEntregaLogica({
    assignmentId: data.assignmentId,
    alumnoId: data.alumnoId,
    grupoId: data.grupoId,
  });
}

export async function createOrGetEntrega(data: {
  assignmentId: string;
  repoName: string;
  repoUrl: string;
  githubUsernames: string[];
  alumnoId?: string;
  grupoId?: string;
}): Promise<Entrega> {
  const existing = await findExistingEntrega(data);
  if (existing) return existing;

  try {
    return await createEntrega(data);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const reconciled = await findExistingEntrega(data);
    if (reconciled) return reconciled;
    throw error;
  }
}
