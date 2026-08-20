import { Entrega, type ParticipantesResueltos } from "@/domain/entities";
import type { PdepUser } from "@/types";
import {
  getAlumnoByGithub,
  getAssignment,
  getEntregaDeUsuario,
  getGrupoDeAlumnoEnAssignment,
  crearEntregaSiAssignmentDisponible,
} from "@/lib/repositories";
import { addCollaborators, crearEntrega, getRepoInfo } from "@/lib/github";
import { buildRepoName } from "@/lib/naming";
import {
  AssignmentNoEncontradoError,
  autorizarAccionSobreAssignment,
} from "./assignmentAuthorization";

export {
  AssignmentNoEncontradoError,
  AssignmentNoDisponibleError,
} from "./assignmentAuthorization";

export class AlumnoNoRegistradoError extends Error {
  constructor(public readonly githubUsername: string) {
    super("Completá tu registro antes de aceptar este assignment.");
    this.name = "AlumnoNoRegistradoError";
  }
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
  autorizarAccionSobreAssignment(user, alumno, assignment);

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
  const createLocalEntrega = (createdRepoName: string, repoUrl: string, repoGithubId?: string) =>
    crearEntregaSiAssignmentDisponible(
      {
        assignmentId: assignment.id,
        repoName: createdRepoName,
        repoUrl,
        githubUsernames: usernames,
        alumnoId: grupoId ? undefined : alumno?.id,
        grupoId,
        repoGithubId,
      },
      user.rol
    );

  const repoPreexistente = await getRepoInfo(repoName);
  if (repoPreexistente) {
    await addCollaborators(repoName, usernames);
    return createLocalEntrega(repoName, repoPreexistente.repoUrl, repoPreexistente.repoGithubId);
  }

  try {
    const resultado = await crearEntrega({
      templateRepo: assignment.nombreDelTemplate(),
      repoName,
      usernames,
      descripcion: `${assignment.titulo} — PdeP`,
    });
    return createLocalEntrega(resultado.repoName, resultado.repoUrl, resultado.repoGithubId);
  } catch (error) {
    // El repo puede haber quedado creado aunque crearEntrega() haya fallado
    // después (ej. addCollaborators cayó tras un createUsingTemplate exitoso)
    // — getRepoInfo trae su id igual que en el camino de repo preexistente,
    // así la entrega no queda dependiendo pura y exclusivamente del
    // self-heal del primer webhook.
    const repoTrasError = await getRepoInfo(repoName);
    if (!repoTrasError) throw error;
    await addCollaborators(repoName, usernames);
    return createLocalEntrega(repoName, repoTrasError.repoUrl, repoTrasError.repoGithubId);
  }
}
