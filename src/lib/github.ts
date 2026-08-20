import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { extractTemplateName, validarRepoName } from "./naming";
import { handleOctokitError, isRequestError } from "./github-errors";

// Exportada: el router de eventos de webhooks (issue #60) la usa para
// validar que el payload venga de la org configurada, no de un fork o de
// otra instalación de la App.
export const ORG = process.env.GITHUB_ORG ?? "pdep-mn-utn";

// ── Octokit autenticado como GitHub App ─────────────────────
// Usa la GitHub App instalada en la org para tener permisos de
// admin sobre repos sin depender de un PAT personal.

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (_octokit) return _octokit;

  try {
    if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID) {
      const privateKey = Buffer.from(
        process.env.GITHUB_APP_PRIVATE_KEY,
        "base64"
      ).toString("utf-8");

      _octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: process.env.GITHUB_APP_ID,
          privateKey,
          installationId: process.env.GITHUB_APP_INSTALLATION_ID,
        },
      });
    } else {
      // Fallback: PAT clásico (para desarrollo rápido)
      _octokit = new Octokit({ auth: process.env.GITHUB_PAT });
    }
  } catch (error) {
    handleOctokitError(error);
  }

  return _octokit!;
}

// ── Crear repo desde template ───────────────────────────────

export interface CreateRepoOptions {
  templateRepo: string; // "kata-funcional-template" (sin org)
  newRepoName: string; // "kata-funcional-juancontardo"
  description?: string;
  isPrivate?: boolean;
}

export async function createRepoFromTemplate(
  opts: CreateRepoOptions
): Promise<{ repoUrl: string; repoFullName: string; repoGithubId: string }> {
  const octokit = getOctokit();

  try {
    const { data } = await octokit.repos.createUsingTemplate({
      template_owner: ORG,
      template_repo: opts.templateRepo,
      owner: ORG,
      name: opts.newRepoName,
      description: opts.description ?? "",
      private: opts.isPrivate ?? true,
      include_all_branches: false,
    });

    return {
      repoUrl: data.html_url,
      repoFullName: data.full_name,
      // Id numérico de GitHub del repo (issue #60) — no cambia con un
      // rename, a diferencia del nombre. Capturarlo acá evita depender
      // pura y exclusivamente del "self-heal" del primer webhook: sin
      // esto, dos renames del mismo repo entregados fuera de orden ANTES
      // de que llegue cualquier otro evento pueden perderse (ningún
      // webhook anterior tuvo la chance de guardar el id todavía).
      repoGithubId: String(data.id),
    };
  } catch (error) {
    handleOctokitError(error);
  }
}

// ── Agregar collaborator(s) a un repo ───────────────────────

export async function addCollaborators(
  repoName: string,
  usernames: string[],
  permission: "push" | "admin" = "push"
): Promise<void> {
  const octokit = getOctokit();
  const MAX_ATTEMPTS = 4;
  const INITIAL_DELAY_MS = 500;
  const MAX_DELAY_MS = 8000;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await Promise.all(
        usernames.map((username) =>
          octokit.repos.addCollaborator({
            owner: ORG,
            repo: repoName,
            username,
            permission,
          })
        )
      );
      return;
    } catch (error) {
      lastError = error;
      const isTransient = isRequestError(error) && (error.status === 404 || error.status === 422);
      if (!isTransient || attempt >= MAX_ATTEMPTS - 1) break;
      const delay = Math.min(
        INITIAL_DELAY_MS * 2 ** attempt + Math.random() * INITIAL_DELAY_MS,
        MAX_DELAY_MS
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  handleOctokitError(lastError);
}

// ── Crear repo + dar acceso en una sola operación ───────────
// Esto es el reemplazo directo de lo que Classroom hace (mal).

export async function crearEntrega(opts: {
  templateRepo: string;
  repoName: string;
  usernames: string[];
  descripcion?: string;
}): Promise<{ repoUrl: string; repoName: string; repoGithubId: string }> {
  const repoName = validarRepoName(opts.repoName);
  const templateName = extractTemplateName(opts.templateRepo);

  const { repoUrl, repoGithubId } = await createRepoFromTemplate({
    templateRepo: templateName,
    newRepoName: repoName,
    description: opts.descripcion,
    isPrivate: true,
  });

  await addCollaborators(repoName, opts.usernames);

  return { repoUrl, repoName, repoGithubId };
}

// ── Listar repos de un assignment ───────────────────────────

export async function listarReposDeAssignment(
  slug: string
): Promise<{ name: string; url: string; updatedAt: string }[]> {
  const octokit = getOctokit();

  try {
    const { data } = await octokit.repos.listForOrg({
      org: ORG,
      type: "all",
      per_page: 100,
      sort: "updated",
    });

    return data
      .filter((repo) => repo.name.startsWith(`${slug}-`))
      .map((repo) => ({
        name: repo.name,
        url: repo.html_url,
        updatedAt: repo.updated_at ?? "",
      }));
  } catch (error) {
    handleOctokitError(error);
  }
}

// ── Eliminar un repo ─────────────────────────────────────────

export type DeleteRepoResult = "deleted" | "already_absent";

export async function deleteRepo(repoName: string): Promise<DeleteRepoResult> {
  const octokit = getOctokit();
  try {
    await octokit.repos.delete({ owner: ORG, repo: repoName });
    return "deleted";
  } catch (error) {
    if (isRequestError(error) && error.status === 404) return "already_absent";
    handleOctokitError(error);
  }
}

// ── Verificar si un repo ya existe ──────────────────────────

export interface RepoInfo {
  repoGithubId: string;
  repoUrl: string;
}

// Reemplaza a un simple repoExists(): boolean — cuando el repo ya existe
// (issue #60, camino de "repo preexistente" en aceptarAssignment.ts), hace
// falta también su id numérico de GitHub para no depender exclusivamente del
// self-heal del primer webhook.
export async function getRepoInfo(repoName: string): Promise<RepoInfo | null> {
  const octokit = getOctokit();
  try {
    const { data } = await octokit.repos.get({ owner: ORG, repo: repoName });
    return { repoGithubId: String(data.id), repoUrl: data.html_url };
  } catch {
    return null;
  }
}

// ── Reconciliar el nombre actual de un repo por su id ───────
// GitHub no garantiza el orden de entrega de webhooks: dos `repository.renamed`
// del mismo repo pueden compartir `updated_at` (resolución de un segundo) y
// procesarse en el orden inverso al real. Consultar el estado actual por id
// en vez de confiar en el nombre del payload converge al nombre verdadero sin
// importar en qué orden se procesen — mismo criterio que `esColaborador` para
// `member`: invalidar y refrescar, no confiar en el delta.
export async function getRepoInfoPorId(
  repoGithubId: string
): Promise<{ repoName: string; repoUrl: string } | null> {
  const octokit = getOctokit();
  try {
    const { data } = await octokit.request("GET /repositories/{repository_id}", {
      repository_id: Number(repoGithubId),
    });
    return { repoName: data.name, repoUrl: data.html_url };
  } catch (error) {
    if (isRequestError(error) && error.status === 404) return null;
    handleOctokitError(error);
  }
}

// ── Listar templates disponibles en la org ──────────────────

export async function listarTemplates(): Promise<
  { name: string; fullName: string; description: string }[]
> {
  const octokit = getOctokit();

  try {
    const { data } = await octokit.repos.listForOrg({
      org: ORG,
      type: "all",
      per_page: 100,
    });

    return data
      .filter((repo) => repo.is_template)
      .map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description ?? "",
      }));
  } catch (error) {
    handleOctokitError(error);
  }
}

// ── CI (issue #58) ───────────────────────────────────────────
// No hay un workflow "de CI" con nombre fijo: se lee el estado combinado de
// los checks del último commit del branch por defecto — mismo mecanismo que
// un badge de CI en un README. Cualquier *.yml en .github/workflows/ que
// publique checks cuenta, sin importar cómo se llame ni cuántos haya.

export interface CheckRunCrudo {
  status: string;
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | "action_required"
    | null;
}

export type EstadoCI =
  | { tipo: "sin_ci" }
  | {
      tipo: "checks";
      checkSuiteIds: string[];
      commitSha: string;
      detalleUrl: string;
      ejecutadoEn: string;
      checkRuns: CheckRunCrudo[];
    };

function ejecutadoEnDesdeCheckRuns(
  checkRuns: { completed_at: string | null; started_at: string | null }[]
): string {
  const timestamps = checkRuns
    .map((run) => run.completed_at ?? run.started_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  return timestamps.at(-1) ?? new Date().toISOString();
}

export async function getEstadoCI(repoName: string): Promise<EstadoCI> {
  const octokit = getOctokit();

  let defaultBranch;
  try {
    ({
      data: { default_branch: defaultBranch },
    } = await octokit.repos.get({ owner: ORG, repo: repoName }));
  } catch (error) {
    handleOctokitError(error);
  }

  let checkRuns;
  try {
    ({
      data: { check_runs: checkRuns },
    } = await octokit.checks.listForRef({
      owner: ORG,
      repo: repoName,
      ref: defaultBranch,
      per_page: 100,
    }));
  } catch (error) {
    handleOctokitError(error);
  }

  if (checkRuns.length === 0) {
    return { tipo: "sin_ci" };
  }

  const checkSuiteIds = Array.from(
    new Set(
      checkRuns
        .map((run) => run.check_suite?.id)
        .filter((id): id is number => id !== undefined && id !== null)
    )
  ).map(String);

  return {
    tipo: "checks",
    checkSuiteIds,
    commitSha: checkRuns[0]!.head_sha,
    detalleUrl: `https://github.com/${ORG}/${repoName}/commit/${checkRuns[0]!.head_sha}/checks`,
    ejecutadoEn: ejecutadoEnDesdeCheckRuns(checkRuns),
    checkRuns: checkRuns.map((run) => ({ status: run.status, conclusion: run.conclusion })),
  };
}

export async function reejecutarCI(
  repoName: string,
  checkSuiteIds: string[]
): Promise<void> {
  const octokit = getOctokit();
  try {
    await Promise.all(
      checkSuiteIds.map((checkSuiteId) =>
        octokit.checks.rerequestSuite({
          owner: ORG,
          repo: repoName,
          check_suite_id: Number(checkSuiteId),
        })
      )
    );
  } catch (error) {
    handleOctokitError(error);
  }
}

// ── Colaboradores (issue #60) ────────────────────────────────
// GitHub no garantiza el orden de entrega de webhooks: un `member.removed`
// puede llegar después de un `member.added` más reciente (o viceversa). En
// vez de confiar en la acción del payload, el webhook de `member` reconcilia
// contra este chequeo — "¿es colaborador ahora mismo?" — igual criterio que
// `getEstadoCI` con `check_suite`: invalidar y refrescar, no confiar en el
// delta. Así el resultado converge a la verdad sin importar el orden.

export async function esColaborador(repoName: string, username: string): Promise<boolean> {
  const octokit = getOctokit();
  try {
    await octokit.repos.checkCollaborator({ owner: ORG, repo: repoName, username });
    return true;
  } catch (error) {
    if (isRequestError(error) && error.status === 404) return false;
    handleOctokitError(error);
  }
}
