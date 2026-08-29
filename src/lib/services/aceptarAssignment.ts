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
import {
  AssignmentNoEncontradoError,
  autorizarAccionSobreAssignment,
} from "./assignmentAuthorization";
import { mensajeOperativo } from "@/lib/mensaje-operativo";

export {
  AssignmentNoEncontradoError,
  AssignmentNoDisponibleError,
} from "./assignmentAuthorization";
// Reexportados por compatibilidad — la fuente real es el dominio
// (`IndividualAssignment.ts`/`GrupalAssignment.ts` — Fase 3 de la
// auditoría de dominio).
export { AlumnoNoRegistradoError } from "@/domain/entities";

export class RepositorioPreexistenteNoAdministradoError extends Error {
  constructor(public readonly repoName: string) {
    super(
      `Ya existe el repositorio ${repoName} en GitHub y no fue creado por esta entrega. Cambiá el slug del TP o resolvé la colisión desde la organización.`
    );
    this.name = "RepositorioPreexistenteNoAdministradoError";
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
  if (existente?.hasRepo()) return existente;

  const participantes: ParticipantesResueltos = await assignment.resolverParticipantesPara(
    user,
    getGrupoDeAlumnoEnAssignment,
    alumno
  );

  const { usernames, grupoId } = participantes;
  const repoName = assignment.nombreDeRepoPara(participantes);
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
  const descripcionRepo = `${assignment.titulo} — PdeP ${entrega.marcadorDeRepo()}`;
  if (entrega.hasRepo()) return entrega;

  const intento = await iniciarProvisionEntrega(entrega.id);
  if (!intento) return entrega;
  if (intento.hasRepo()) return intento;

  let repoPreexistente: RepoInfo | null;
  try {
    repoPreexistente = await getRepoInfo(repoName);
  } catch (error) {
    await fallarProvisionEntrega(entrega.id, mensajeOperativo(error));
    throw error;
  }
  if (repoPreexistente) {
    if (!intento.reconoceComoPropio(repoPreexistente)) {
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
    if (!intentoConCreacionIniciada.reconoceComoPropio(repoTrasError)) {
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
