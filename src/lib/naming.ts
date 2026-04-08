// Funciones puras de naming y lógica de negocio.
// Separadas de github.ts para poder testear sin Octokit.

/**
 * Genera el nombre del repo para una entrega.
 * Individual: `{slug}-{username}`
 * Grupal: `{slug}-{grupoId}`
 */
export function buildRepoName(opts: {
  slug: string;
  usernames: string[];
  grupoId?: string;
}): string {
  const suffix = opts.grupoId
    ? opts.grupoId
    : opts.usernames.length === 1
      ? opts.usernames[0]
      : opts.usernames.slice(0, 3).join("-");

  return `${opts.slug}-${suffix}`.toLowerCase();
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
