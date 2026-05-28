import { Entrega, type ParticipantesResueltos } from "@/domain/entities";
import type { PdepUser } from "@/types";
import {
  getAlumnoByGithub,
  getAssignment,
  getEntregaDeUsuario,
  getGrupoDeAlumnoEnAssignment,
  createOrGetEntrega,
} from "@/lib/repositories";
import { addCollaborators, crearEntrega, repoExists } from "@/lib/github";
import { buildRepoName } from "@/lib/naming";

export class AssignmentNoEncontradoError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Assignment no encontrado");
    this.name = "AssignmentNoEncontradoError";
  }
}

export class AlumnoNoRegistradoError extends Error {
  constructor(public readonly githubUsername: string) {
    super("Completá tu registro antes de aceptar este assignment.");
    this.name = "AlumnoNoRegistradoError";
  }
}

function repoUrlFor(repoName: string): string {
  const org = process.env.GITHUB_ORG ?? "pdep-mn-utn";
  return `https://github.com/${org}/${repoName}`;
}

export async function aceptarAssignment(
  assignmentId: string,
  user: PdepUser
): Promise<Entrega> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw new AssignmentNoEncontradoError(assignmentId);

  const existente = await getEntregaDeUsuario(assignment.id, user.githubUsername);
  if (existente) return existente;

  const participantes: ParticipantesResueltos = await assignment.resolverParticipantesPara(
    user,
    getGrupoDeAlumnoEnAssignment
  );

  const { usernames, grupoId } = participantes;
  const alumno = grupoId ? null : await getAlumnoByGithub(user.githubUsername);
  if (!grupoId && !alumno) throw new AlumnoNoRegistradoError(user.githubUsername);

  const repoName = buildRepoName({ slug: assignment.slug, usernames, grupoId });
  const createLocalEntrega = (createdRepoName: string, repoUrl: string) =>
    createOrGetEntrega({
      assignmentId: assignment.id,
      repoName: createdRepoName,
      repoUrl,
      githubUsernames: usernames,
      alumnoId: alumno?.id,
      grupoId,
    });

  if (await repoExists(repoName)) {
    await addCollaborators(repoName, usernames);
    return createLocalEntrega(repoName, repoUrlFor(repoName));
  }

  try {
    const resultado = await crearEntrega({
      templateRepo: assignment.nombreDelTemplate(),
      slug: assignment.slug,
      usernames,
      grupoId,
      descripcion: `${assignment.titulo} — PdeP`,
    });
    return createLocalEntrega(resultado.repoName, resultado.repoUrl);
  } catch (error) {
    if (!(await repoExists(repoName))) throw error;
    await addCollaborators(repoName, usernames);
    return createLocalEntrega(repoName, repoUrlFor(repoName));
  }
}
