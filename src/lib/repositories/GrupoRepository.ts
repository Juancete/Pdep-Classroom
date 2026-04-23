import { getEM } from "@/lib/db";
import { Grupo } from "@/domain/entities";
import type { Alumno, GrupalAssignment } from "@/domain/entities";
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

// Usado por la sincronización desde la planilla: crea el Grupo (nombre +
// paradigma + assignment) si no existe, y agrega al alumno como miembro
// si no lo era. Idempotente.
export async function upsertGrupoConMiembro(params: {
  nombreGrupo: string;
  paradigma: Paradigma;
  assignment: GrupalAssignment;
  alumno: Alumno;
}): Promise<Grupo> {
  const { nombreGrupo, paradigma, assignment, alumno } = params;
  const em = await getEM();

  const existente = await em.findOne(
    Grupo,
    {
      nombre: nombreGrupo,
      paradigma,
      assignment: { id: assignment.id },
    },
    { populate: ["alumnos"] }
  );

  let grupo: Grupo;
  if (existente) {
    grupo = existente;
  } else {
    grupo = new Grupo();
    grupo.nombre = nombreGrupo;
    grupo.paradigma = paradigma;
    grupo.assignment = assignment;
    grupo.maxIntegrantes = assignment.maxIntegrantes;
    grupo.creadoPor = "sheets-sync";
    em.persist(grupo);
  }

  if (!grupo.alumnos.contains(alumno)) {
    grupo.alumnos.add(alumno);
  }

  await em.flush();
  return grupo;
}
