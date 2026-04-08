import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { buildRepoName, extractTemplateName } from "./naming";

const ORG = process.env.GITHUB_ORG ?? "pdep-mn";

// ── Octokit autenticado como GitHub App ─────────────────────
// Usa la GitHub App instalada en la org para tener permisos de
// admin sobre repos sin depender de un PAT personal.

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (_octokit) return _octokit;

  // Si hay GitHub App configurada, usamos eso (recomendado)
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
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

  return _octokit;
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
): Promise<{ repoUrl: string; repoFullName: string }> {
  const octokit = getOctokit();

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
  };
}

// ── Agregar collaborator(s) a un repo ───────────────────────

export async function addCollaborators(
  repoName: string,
  usernames: string[],
  permission: "push" | "admin" = "push"
): Promise<void> {
  const octokit = getOctokit();

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
}

// ── Crear repo + dar acceso en una sola operación ───────────
// Esto es el reemplazo directo de lo que Classroom hace (mal).

export async function crearEntrega(opts: {
  templateRepo: string;
  slug: string;
  usernames: string[];
  grupoId?: string;
  descripcion?: string;
}): Promise<{ repoUrl: string; repoName: string }> {
  const repoName = buildRepoName({
    slug: opts.slug,
    usernames: opts.usernames,
    grupoId: opts.grupoId,
  });

  const templateName = extractTemplateName(opts.templateRepo);

  const { repoUrl } = await createRepoFromTemplate({
    templateRepo: templateName,
    newRepoName: repoName,
    description: opts.descripcion,
    isPrivate: true,
  });

  // Pequeña pausa para que GitHub procese la creación
  await new Promise((r) => setTimeout(r, 1500));

  await addCollaborators(repoName, opts.usernames);

  return { repoUrl, repoName };
}

// ── Listar repos de un assignment ───────────────────────────

export async function listarReposDeAssignment(
  slug: string
): Promise<{ name: string; url: string; updatedAt: string }[]> {
  const octokit = getOctokit();

  const { data } = await octokit.repos.listForOrg({
    org: ORG,
    type: "all",
    per_page: 100,
    sort: "updated",
  });

  return data
    .filter((r) => r.name.startsWith(`${slug}-`))
    .map((r) => ({
      name: r.name,
      url: r.html_url,
      updatedAt: r.updated_at ?? "",
    }));
}

// ── Verificar si un repo ya existe ──────────────────────────

export async function repoExists(repoName: string): Promise<boolean> {
  const octokit = getOctokit();
  try {
    await octokit.repos.get({ owner: ORG, repo: repoName });
    return true;
  } catch {
    return false;
  }
}

// ── Listar templates disponibles en la org ──────────────────

export async function listarTemplates(): Promise<
  { name: string; fullName: string; description: string }[]
> {
  const octokit = getOctokit();

  const { data } = await octokit.repos.listForOrg({
    org: ORG,
    type: "all",
    per_page: 100,
  });

  return data
    .filter((r) => r.is_template)
    .map((r) => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description ?? "",
    }));
}
