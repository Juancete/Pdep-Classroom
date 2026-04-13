import { getEM } from "@/lib/db";
import { Assignment, Grupo, Entrega } from "@/domain/entities";

export async function getEntregas(assignmentId?: string): Promise<Entrega[]> {
  const em = await getEM();
  const where = assignmentId ? { assignment: { id: assignmentId } } : {};
  return em.find(Entrega, where, { populate: ["assignment", "grupo"] });
}

// Devuelve todas las entregas de un usuario de una sola query,
// indexadas por assignmentId para lookup O(1) en el template.
export async function getEntregasDeUsuario(
  githubUsername: string
): Promise<Map<string, Entrega>> {
  const em = await getEM();
  const entregas = await em.find(Entrega, {});
  const map = new Map<string, Entrega>();
  const normalized = githubUsername.toLowerCase();
  for (const e of entregas) {
    if (e.githubUsernames.some((u) => u.toLowerCase() === normalized)) {
      map.set(e.assignment.id, e);
    }
  }
  return map;
}

export async function getEntregaDeUsuario(
  assignmentId: string,
  githubUsername: string
): Promise<Entrega | null> {
  const em = await getEM();
  const entregas = await em.find(Entrega, { assignment: { id: assignmentId } });
  return (
    entregas.find((e) =>
      e.githubUsernames.some(
        (u) => u.toLowerCase() === githubUsername.toLowerCase()
      )
    ) ?? null
  );
}

// Devuelve el conteo de entregas por assignmentId en una sola query.
export async function getEntregaCountsByAssignment(): Promise<Map<string, number>> {
  const em = await getEM();
  const entregas = await em.find(Entrega, {}, { fields: ["assignment"] });
  const map = new Map<string, number>();
  for (const e of entregas) {
    const id = e.assignment.id;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

export async function createEntrega(data: {
  assignmentId: string;
  repoName: string;
  repoUrl: string;
  githubUsernames: string[];
  grupoId?: string;
}): Promise<Entrega> {
  const em = await getEM();

  const assignment = await em.findOneOrFail(Assignment, { id: data.assignmentId });

  const entrega = new Entrega();
  entrega.assignment = assignment;
  entrega.repoName = data.repoName;
  entrega.repoUrl = data.repoUrl;
  entrega.githubUsernames = data.githubUsernames;

  if (data.grupoId) {
    entrega.grupo = em.getReference(Grupo, data.grupoId);
  }

  em.persist(entrega);
  await em.flush();
  return entrega;
}
