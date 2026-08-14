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
import {
  AssignmentNoEncontradoError,
  autorizarAccesoAssignment,
} from "./assignmentAuthorization";

export { AssignmentNoEncontradoError } from "./assignmentAuthorization";

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
  const [assignment, alumno] = await Promise.all([
    getAssignment(assignmentId),
    getAlumnoByGithub(user.githubUsername, true),
  ]);
  if (!assignment) throw new AssignmentNoEncontradoError(assignmentId);
  autorizarAccesoAssignment(user, alumno, assignment);

  const existente = await getEntregaDeUsuario(assignment.id, user.githubUsername);
  if (existente) return existente;

  const participantes: ParticipantesResueltos = await assignment.resolverParticipantesPara(
    user,
    getGrupoDeAlumnoEnAssignment
  );

  const { usernames, grupoId, grupoNombreNormalizado } = participantes;
  if (!grupoId && !alumno) throw new AlumnoNoRegistradoError(user.githubUsername);

  if (grupoId && !grupoNombreNormalizado) {
    throw new Error(`El grupo ${grupoId} no tiene un nombre normalizado.`);
  }
  const repoName = grupoId
    ? buildRepoName({
        slug: assignment.slug,
        grupoNombreNormalizado,
      })
    : buildRepoName({
        slug: assignment.slug,
        githubUsername: usernames[0]!,
      });
  const createLocalEntrega = (createdRepoName: string, repoUrl: string) =>
    createOrGetEntrega({
      assignmentId: assignment.id,
      repoName: createdRepoName,
      repoUrl,
      githubUsernames: usernames,
      alumnoId: grupoId ? undefined : alumno?.id,
      grupoId,
    });

  if (await repoExists(repoName)) {
    await addCollaborators(repoName, usernames);
    return createLocalEntrega(repoName, repoUrlFor(repoName));
  }

  try {
    const resultado = await crearEntrega({
      templateRepo: assignment.nombreDelTemplate(),
      repoName,
      usernames,
      descripcion: `${assignment.titulo} — PdeP`,
    });
    return createLocalEntrega(resultado.repoName, resultado.repoUrl);
  } catch (error) {
    if (!(await repoExists(repoName))) throw error;
    await addCollaborators(repoName, usernames);
    return createLocalEntrega(repoName, repoUrlFor(repoName));
  }
}
