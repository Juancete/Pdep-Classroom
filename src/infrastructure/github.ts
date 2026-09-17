import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { validarRepoName } from "@/lib/naming";
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
  // Ya resuelto (sin org) — ver `Assignment.nombreDelTemplate()`. Antes acá
  // se volvía a resolver con `extractTemplateName` (duplicado literal de
  // ese método — Fase 3 de la auditoría de dominio); el único caller
  // (`aceptarAssignment.ts`) ya pasaba el nombre resuelto, así que la
  // segunda resolución era muerta.
  templateRepo: string;
  repoName: string;
  usernames: string[];
  descripcion?: string;
}): Promise<{ repoUrl: string; repoName: string; repoGithubId: string }> {
  const repoName = validarRepoName(opts.repoName);

  const { repoUrl, repoGithubId } = await createRepoFromTemplate({
    templateRepo: opts.templateRepo,
    newRepoName: repoName,
    description: opts.descripcion,
    isPrivate: true,
  });

  await addCollaborators(repoName, opts.usernames);

  return { repoUrl, repoName, repoGithubId };
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
  description: string | null;
  createdAt: Date | null;
}

// Reemplaza a un simple repoExists(): boolean — cuando el repo ya existe
// (issue #60, camino de "repo preexistente" en aceptarAssignment.ts), hace
// falta también su id numérico de GitHub para no depender exclusivamente del
// self-heal del primer webhook.
export async function getRepoInfo(repoName: string): Promise<RepoInfo | null> {
  const octokit = getOctokit();
  try {
    const { data } = await octokit.repos.get({ owner: ORG, repo: repoName });
    return {
      repoGithubId: String(data.id),
      repoUrl: data.html_url,
      description: data.description,
      createdAt: data.created_at ? new Date(data.created_at) : null,
    };
  } catch (error) {
    if (isRequestError(error) && error.status === 404) return null;
    handleOctokitError(error);
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
    // Resolución directa por id (issue #88): una sola llamada en vez de
    // recorrer toda la org paginada y filtrar acá — con casi 300 repos eran
    // tres requests por cada evento `repository`. `GET /repositories/{id}`
    // no figura en la referencia REST publicada pero es estable, es lo que
    // usa el propio Octokit para resolver ids y funciona con el token de
    // instalación. Los tipos generados no lo declaran: se castea al shape
    // mínimo que se consume (mismo criterio que `getConfiguracionDeApp`).
    const { data: repo } = (await octokit.request("GET /repositories/{repository_id}", {
      repository_id: Number(repoGithubId),
    })) as { data: { name: string; html_url: string; owner: { login: string } } };
    // La reconciliación sigue acotada a la organización configurada: un id
    // de otra org no es "nuestro" aunque GitHub lo devuelva.
    if (repo.owner.login !== ORG) return null;
    return { repoName: repo.name, repoUrl: repo.html_url };
  } catch (error) {
    if (isRequestError(error) && error.status === 404) return null;
    handleOctokitError(error);
  }
}

// ── Listar templates disponibles en la org ──────────────────
// `repos.listForOrg` no tiene filtro por template: obligaba a traer los
// cientos de repos de la org (paginando) y filtrar en memoria. La API de
// búsqueda sí lo soporta (`template:true`), así que GitHub filtra del lado
// del servidor. La búsqueda excluye forks por defecto y eso es deseable:
// los templates son la base de los repos de los alumnos y tienen que ser
// repos propios de la org, no forks de otro lado.
// Trade-off: la búsqueda se sirve desde un índice que puede tardar unos
// segundos en reflejar un repo recién marcado como template.

export async function listarTemplates(): Promise<
  { name: string; fullName: string; description: string }[]
> {
  const octokit = getOctokit();

  try {
    // `paginate` normaliza la respuesta de búsqueda a la lista de `items`.
    const templates = await octokit.paginate(octokit.search.repos, {
      q: `org:${ORG} template:true`,
      per_page: 100,
    });

    return templates.map((repo) => ({
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
    // Es un agregado (passing/failing del commit), no una vista: se traen
    // todos los check runs. `paginate` normaliza `{ total_count, check_runs }`
    // a la lista plana (issue #88).
    checkRuns = await octokit.paginate(octokit.checks.listForRef, {
      owner: ORG,
      repo: repoName,
      ref: defaultBranch,
      per_page: 100,
    });
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

// ── Diagnóstico de la GitHub App (issue #98) ────────────────
// La App de producción puede tener permisos, eventos suscriptos o webhook
// incompletos sin que ningún deploy lo detecte — el síntoma aparece recién
// cuando alguien aprieta "Actualizar CI" y GitHub responde 403. Esta consulta
// alimenta el check de `/admin/operaciones` que lista qué le falta a la App
// contra lo que Classroom necesita (ver `evaluarConfiguracionDeApp`).
//
// "GET /app" devuelve lo *configurado en la App* — no necesariamente lo que
// el token de instalación (el que usa `getEstadoCI`) puede hacer hoy: cuando
// se agregan permisos a la App, la instalación en la org los conserva
// viejos hasta que alguien los aprueba explícitamente. Por eso los permisos
// y eventos efectivos salen de "GET /app/installations/{installation_id}"
// (la instalación), y se marca `aprobacionPendiente` cuando la App pide algo
// que la instalación todavía no tiene.

export type ConfiguracionDeApp = {
  permisos: Record<string, string>; // los de la instalación (lo que el token realmente tiene)
  eventos: string[]; // ídem
  webhook: { url: string } | null;
  aprobacionPendiente: boolean; // la App configura algo que la instalación todavía no aprobó
};

// Sin ifs por tipo: recorre los permisos y eventos declarados por la App y
// verifica que la instalación los tenga con el mismo valor.
function hayCambiosSinAprobar(
  app: { permissions: Record<string, string>; events: string[] },
  instalacion: { permissions: Record<string, string>; events: string[] }
): boolean {
  const permisoSinAprobar = Object.entries(app.permissions).some(
    ([nombrePermiso, valorPermiso]) => instalacion.permissions[nombrePermiso] !== valorPermiso
  );
  const eventoSinAprobar = app.events.some((evento) => !instalacion.events.includes(evento));
  return permisoSinAprobar || eventoSinAprobar;
}

export async function getConfiguracionDeApp(): Promise<ConfiguracionDeApp> {
  // `getOctokit()` cae a un PAT clásico si falta cualquiera de estas tres env
  // vars (ver más arriba) — un PAT no tiene identidad de App para autenticar
  // como tal, así que ni vale la pena llamar a `octokit.auth`.
  if (
    !process.env.GITHUB_APP_ID ||
    !process.env.GITHUB_APP_PRIVATE_KEY ||
    !process.env.GITHUB_APP_INSTALLATION_ID
  ) {
    throw new Error(
      "La consulta de configuración requiere autenticación como GitHub App (GITHUB_APP_ID/PRIVATE_KEY)"
    );
  }

  const octokit = getOctokit();

  try {
    const auth = (await octokit.auth({ type: "app" })) as { token: string };
    const headers = { authorization: `bearer ${auth.token}` };

    // Los tipos generados de Octokit para "GET /app" no alcanzan acá: tipan
    // `permissions` con claves fijas (en vez de `Record<string, string>` —
    // cualquier permiso nuevo de GitHub rompería el chequeo) y filtran
    // `data` como potencialmente `null` aunque un 200 siempre trae body. Se
    // castea al shape mínimo que efectivamente se consume.
    const { data: app } = (await octokit.request("GET /app", { headers })) as {
      data: { permissions?: Record<string, string>; events?: string[] };
    };
    const permisosDeLaApp = app.permissions ?? {};
    const eventosDeLaApp = app.events ?? [];

    // Mismo motivo de cast que "GET /app": los tipos generados no alcanzan
    // para el shape mínimo que se consume acá.
    const { data: instalacion } = (await octokit.request(
      "GET /app/installations/{installation_id}",
      { installation_id: Number(process.env.GITHUB_APP_INSTALLATION_ID), headers }
    )) as {
      data: { permissions?: Record<string, string>; events?: string[] };
    };
    const permisos = instalacion.permissions ?? {};
    const eventos = instalacion.events ?? [];

    const aprobacionPendiente = hayCambiosSinAprobar(
      { permissions: permisosDeLaApp, events: eventosDeLaApp },
      { permissions: permisos, events: eventos }
    );

    let webhook: { url: string } | null;
    try {
      // "GET /app/hook/config" sólo expone url/content_type/secret/insecure_ssl
      // — no hay un flag de "activo": el webhook existe (200) o no (404).
      const { data: hookConfig } = await octokit.request("GET /app/hook/config", { headers });
      webhook = { url: hookConfig.url ?? "" };
    } catch (error) {
      if (isRequestError(error) && error.status === 404) {
        webhook = null;
      } else {
        throw error;
      }
    }

    return { permisos, eventos, webhook, aprobacionPendiente };
  } catch (error) {
    handleOctokitError(error);
  }
}
