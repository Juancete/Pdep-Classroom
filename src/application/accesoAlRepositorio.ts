import { ColaboradorNoInvitableError, type Entrega } from "@/domain/entities";
import {
  actualizarColaboradoresDeEntrega,
  getEntregaLogica,
  type AccesoAlRepositorioDeGrupo,
  type ContextoDeAcceso,
} from "@/infrastructure/repositories";
import {
  addCollaborators,
  getRepoInfo,
  removeCollaborator,
  SIN_REINTENTOS,
  TIMEOUT_EN_TRANSACCION_MS,
} from "@/infrastructure/github";
import { GithubRecursoNoEncontradoError } from "@/infrastructure/github-errors";
import type { EntityManager } from "@mikro-orm/postgresql";

async function otorgarA(
  { assignmentId, grupoId, githubUsername }: ContextoDeAcceso,
  transaction: EntityManager
): Promise<void> {
  const entrega = await getEntregaLogica({ assignmentId, grupoId }, transaction);
  const repoName = entrega?.nombreDeRepoActivo();
  if (!entrega || !repoName) return;
  // Sin red si ya figura: `githubUsernames` es reflejo de lo invitado.
  if (entrega.perteneceA(githubUsername)) return;

  try {
    // Sin reintentos: hay una transacción abierta y el repo ya es
    // establecido, así que un 404 es un username inexistente, no transitorio.
    await addCollaborators(repoName, [githubUsername], "push", SIN_REINTENTOS);
  } catch (error) {
    if (error instanceof GithubRecursoNoEncontradoError) {
      throw new ColaboradorNoInvitableError(githubUsername);
    }
    throw error;
  }
  await actualizarColaboradoresDeEntrega(entrega.id, { agregar: githubUsername }, transaction);
}

// Una provisión fallida a medias puede haber dejado el repo creado con algunos
// integrantes ya invitados (issue #123). Se verifica que el repo sea propio
// antes de revocar: un repo homónimo ajeno
// (`RepositorioPreexistenteNoAdministradoError`) no se debe tocar.
async function nombreDeRepoConAcceso(entrega: Entrega): Promise<string | undefined> {
  const repoActivo = entrega.nombreDeRepoActivo();
  if (repoActivo) return repoActivo;
  const repoParcial = entrega.nombreDeRepoParcial();
  if (!repoParcial) return undefined;
  const repo = await getRepoInfo(repoParcial, { timeoutMs: TIMEOUT_EN_TRANSACCION_MS });
  return repo && entrega.reconoceComoPropio(repo) ? repoParcial : undefined;
}

async function revocarA(
  { assignmentId, grupoId, githubUsername }: ContextoDeAcceso,
  transaction: EntityManager
): Promise<void> {
  const entrega = await getEntregaLogica({ assignmentId, grupoId }, transaction);
  const repoName = entrega && (await nombreDeRepoConAcceso(entrega));
  if (!entrega || !repoName) return;

  // Sin guarda de `perteneceA`: `githubUsernames` se actualiza por webhook y
  // puede ir atrasado; saltear la revocación dejaría acceso vivo en GitHub.
  // `removeCollaborator` ya es idempotente ante el 404.
  await removeCollaborator(repoName, githubUsername);
  await actualizarColaboradoresDeEntrega(entrega.id, { quitar: githubUsername }, transaction);
}

export const accesoAlRepositorioDeGrupo: AccesoAlRepositorioDeGrupo = { otorgarA, revocarA };
