import { Entrega, type ParticipantesResueltos } from "@/domain/entities";
import type { PdepUser } from "@/types";
import {
  getAlumnoByGithub,
  getAssignment,
  getEntregaDeUsuario,
  getGrupoDeAlumnoEnAssignment,
  crearEntregaSiAssignmentDisponible,
  iniciarProvisionEntrega,
  marcarCreacionGithubIniciada,
  completarProvisionEntrega,
  fallarProvisionEntrega,
} from "@/lib/repositories";
import { addCollaborators, crearEntrega, getRepoInfo, type RepoInfo } from "@/lib/github";
import { buildRepoName } from "@/lib/naming";
import {
  AssignmentNoEncontradoError,
  autorizarAccionSobreAssignment,
} from "./assignmentAuthorization";
import { mensajeOperativo } from "@/lib/mensaje-operativo";

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

export class RepositorioPreexistenteNoAdministradoError extends Error {
  constructor(public readonly repoName: string) {
    super(
      `Ya existe el repositorio ${repoName} en GitHub y no fue creado por esta entrega. Cambiá el slug del TP o resolvé la colisión desde la organización.`
    );
    this.name = "RepositorioPreexistenteNoAdministradoError";
  }
}

function repoCompatibleConIntento(
  intento: { provisionCreacionIniciadaEn?: Date; repoGithubId?: string },
  repo: RepoInfo,
  marcadorEntrega: string
): boolean {
  const inicio = intento.provisionCreacionIniciadaEn;
  if (!inicio || !repo.createdAt) return false;
  // GitHub informa created_at con precisión de segundos; toleramos cinco
  // segundos hacia atrás respecto del timestamp local tomado antes del POST.
  return (
    ((intento.repoGithubId !== undefined && intento.repoGithubId === repo.repoGithubId) ||
      repo.description?.includes(marcadorEntrega) === true) &&
    repo.createdAt.getTime() >= inicio.getTime() - 5_000
  );
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
  if (existente?.provisionEstaActiva()) return existente;

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
  const entrega = await crearEntregaSiAssignmentDisponible(
    {
      assignmentId: assignment.id,
      repoName,
      githubUsernames: usernames,
      alumnoId: grupoId ? undefined : alumno?.id,
      grupoId,
      provisionEstado: "pendiente",
    },
    user.rol
  );
  const marcadorEntrega = `[pdep-entrega:${entrega.id}]`;
  const descripcionRepo = `${assignment.titulo} — PdeP ${marcadorEntrega}`;
  if (entrega.provisionEstaActiva()) return entrega;

  const intento = await iniciarProvisionEntrega(entrega.id);
  if (!intento) return entrega;
  if (intento.provisionEstaActiva()) return intento;

  let repoPreexistente: RepoInfo | null;
  try {
    repoPreexistente = await getRepoInfo(repoName);
  } catch (error) {
    await fallarProvisionEntrega(entrega.id, mensajeOperativo(error));
    throw error;
  }
  if (repoPreexistente) {
    if (!repoCompatibleConIntento(intento, repoPreexistente, marcadorEntrega)) {
      const colision = new RepositorioPreexistenteNoAdministradoError(repoName);
      await fallarProvisionEntrega(entrega.id, colision.message);
      throw colision;
    }
    try {
      await addCollaborators(repoName, usernames);
      return completarProvisionEntrega(entrega.id, {
        repoName,
        repoUrl: repoPreexistente.repoUrl,
        repoGithubId: repoPreexistente.repoGithubId,
      });
    } catch (error) {
      await fallarProvisionEntrega(entrega.id, mensajeOperativo(error));
      throw error;
    }
  }

  let intentoConCreacionIniciada = intento;
  try {
    intentoConCreacionIniciada = await marcarCreacionGithubIniciada(entrega.id);
    const resultado = await crearEntrega({
      templateRepo: assignment.nombreDelTemplate(),
      repoName,
      usernames,
      descripcion: descripcionRepo,
    });
    return completarProvisionEntrega(entrega.id, resultado);
  } catch (error) {
    // El repo puede haber quedado creado aunque crearEntrega() haya fallado
    // después (ej. addCollaborators cayó tras un createUsingTemplate exitoso)
    // — getRepoInfo trae su id igual que en el camino de repo preexistente,
    // así la entrega no queda dependiendo pura y exclusivamente del
    // self-heal del primer webhook.
    const repoTrasError = await getRepoInfo(repoName).catch(() => null);
    if (!repoTrasError) {
      await fallarProvisionEntrega(entrega.id, mensajeOperativo(error));
      throw error;
    }
    if (
      !repoCompatibleConIntento(
        intentoConCreacionIniciada,
        repoTrasError,
        marcadorEntrega
      )
    ) {
      const colision = new RepositorioPreexistenteNoAdministradoError(repoName);
      await fallarProvisionEntrega(entrega.id, colision.message);
      throw colision;
    }
    try {
      await addCollaborators(repoName, usernames);
      return completarProvisionEntrega(entrega.id, {
        repoName,
        repoUrl: repoTrasError.repoUrl,
        repoGithubId: repoTrasError.repoGithubId,
      });
    } catch (recoveryError) {
      await fallarProvisionEntrega(entrega.id, mensajeOperativo(recoveryError));
      throw recoveryError;
    }
  }
}
