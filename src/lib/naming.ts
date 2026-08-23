// Funciones puras de naming y lógica de negocio.
// Separadas de github.ts para poder testear sin Octokit.

export const GITHUB_REPO_NAME_MAX_LENGTH = 100;

export class NombreRepositorioDemasiadoLargoError extends Error {
  constructor(public readonly repoName: string) {
    super(
      `El nombre del repositorio generado supera el límite de ${GITHUB_REPO_NAME_MAX_LENGTH} caracteres de GitHub.`
    );
    this.name = "NombreRepositorioDemasiadoLargoError";
  }
}

export function validarRepoName(repoName: string): string {
  if (repoName.length > GITHUB_REPO_NAME_MAX_LENGTH) {
    throw new NombreRepositorioDemasiadoLargoError(repoName);
  }
  return repoName;
}

/**
 * Genera el nombre del repo para una entrega.
 * Individual: `{slug}-{username}`
 * Grupal: `{slug}-{nombreGrupoNormalizado}`
 */
export function buildRepoName(
  opts:
    | { slug: string; githubUsername: string }
    | { slug: string; grupoNombreNormalizado: string }
): string {
  const suffix =
    "grupoNombreNormalizado" in opts
      ? opts.grupoNombreNormalizado
      : opts.githubUsername;

  return validarRepoName(`${opts.slug}-${suffix}`.toLowerCase());
}

/**
 * Genera un slug a partir de un título.
 * "Kata Funcional — Rompecabezas" → "kata-funcional-rompecabezas"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Extrae el nombre del template sin la org.
 * "pdep-mn-utn/kata-template" → "kata-template"
 * "kata-template" → "kata-template"
 */
export function extractTemplateName(templateRepo: string): string {
  return templateRepo.includes("/")
    ? templateRepo.split("/").pop()!
    : templateRepo;
}
