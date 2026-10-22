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
 * Enumera una lista de frases en español, separadas por coma y con "ni"
 * antes de la última: `["a","b","c"] → "a, b ni c"`. Usado para componer el
 * mensaje de sincronizaciones pendientes con un asunto por feature/canal, en
 * vez de una cadena de `if` que enumere combinaciones a mano.
 */
export function enumerar(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} ni ${items[items.length - 1]}`;
}


/**
 * Sustantivo en singular o plural según la cantidad (sólo el sustantivo, sin
 * el número). El plural por defecto agrega "s"; para frases irregulares
 * ("cambio registrado") se pasa explícito.
 */
export function pluralizar(cantidad: number, singular: string, plural = `${singular}s`): string {
  return cantidad === 1 ? singular : plural;
}

/** Primera letra en mayúscula: "funcional" → "Funcional". */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Separa un nombre completo en nombre y apellido: la última palabra es el
 * apellido y todas las anteriores el nombre. Con una sola palabra es el
 * nombre y el apellido queda vacío.
 */
export function separarNombreYApellido(nombreCompleto: string): { nombre: string; apellido: string } {
  const palabras = nombreCompleto.split(" ").filter(Boolean);
  return {
    nombre: palabras.slice(0, -1).join(" ") || palabras[0] || "",
    apellido: palabras.length > 1 ? palabras[palabras.length - 1] : "",
  };
}
