import {
  Entrega,
  AssignmentNoEncontradoError,
  AssignmentNoDisponibleError,
  type ParticipantesResueltos,
} from "@/domain/entities";
import type { PdepUser } from "@/types";
import {
  getAssignment,
  getEntregaDeUsuario,
  getGrupoDeAlumnoEnAssignment,
  crearEntregaSiAssignmentDisponible,
  iniciarProvisionEntrega,
  marcarCreacionGithubIniciada,
  completarProvisionEntrega,
  fallarProvisionEntrega,
} from "@/infrastructure/repositories";
import { addCollaborators, crearEntrega, getRepoInfo, type RepoInfo } from "@/infrastructure/github";
import { resolverParticipante } from "./participante";
import { mensajeOperativo } from "@/lib/mensaje-operativo";

// Reexportados por compatibilidad — la fuente real es el dominio
// (`Assignment.ts` — antes vivían en un módulo de autorización aparte,
// retirado en el issue #107/#112 junto con la autorización académica que
// se mudó a `Participante`).
export { AssignmentNoEncontradoError, AssignmentNoDisponibleError };

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
  const [assignment, participante] = await Promise.all([
    getAssignment(assignmentId),
    resolverParticipante(user),
  ]);
  if (!assignment) throw new AssignmentNoEncontradoError(assignmentId);
  participante.autorizarAccionSobreAssignment(assignment);

  const existente = await getEntregaDeUsuario(assignment.id, participante.githubUsername);
  if (existente?.hasRepo()) return existente;

  const participantes: ParticipantesResueltos = await assignment.resolverParticipantesPara(
    participante,
    getGrupoDeAlumnoEnAssignment
  );

  const { usernames, grupoId } = participantes;
  const repoName = assignment.nombreDeRepoPara(participantes);
  // Individual sin grupoId: un docente sin fila en `Alumno` no tiene
  // `alumnoId` — `crearEntregaSiAssignmentDisponible`/`findExistingEntrega`
  // caen entonces al lookup por `repoName` (único por username), que alcanza
  // para la idempotencia (ver comentario en `EntregaRepository.findExistingEntrega`).
  const entrega = await crearEntregaSiAssignmentDisponible({
    assignmentId: assignment.id,
    repoName,
    githubUsernames: usernames,
    alumnoId: grupoId ? undefined : participante.alumnoId(),
    grupoId,
    provisionEstado: "pendiente",
  });
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
