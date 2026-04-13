import { getEM } from "@/lib/db";
import { Grupo } from "@/domain/entities";
import type { Paradigma } from "@/types";

export async function getGrupos(paradigma?: Paradigma): Promise<Grupo[]> {
  const em = await getEM();
  const where = paradigma ? { paradigma } : {};
  return em.find(Grupo, where, { populate: ["assignment", "alumnos"] });
}

export async function getGruposDeAssignment(assignmentId: string): Promise<Grupo[]> {
  const em = await getEM();
  return em.find(
    Grupo,
    { assignment: { id: assignmentId } },
    { populate: ["alumnos"] }
  );
}

export async function getGrupoDeAlumnoEnAssignment(
  assignmentId: string,
  githubUsername: string
): Promise<Grupo | null> {
  const em = await getEM();
  return em.findOne(
    Grupo,
    {
      assignment: { id: assignmentId },
      alumnos: { githubUsername: { $ilike: githubUsername } },
    },
    { populate: ["alumnos"] }
  );
}
