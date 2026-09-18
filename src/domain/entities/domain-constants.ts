export const ALUMNO_LEGAJO_PATTERN = "\\d{4,8}";
export const ALUMNO_EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";
// Tope de 39 caracteres (límite real de GitHub para un username) codificado
// directo en el literal en vez de interpolado: la columna de `Docente`
// es varchar(255) y sin este tope el alta reventaba en el flush de la DB en
// vez de devolver un error de campo.
export const GITHUB_USERNAME_PATTERN = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?";
export const GITHUB_USERNAME_MAX_LENGTH = 39;
export const COMISION_ANIO_MIN = 2020;
export const COMISION_ANIO_MAX = 2100;
export const GRUPAL_MIN_MAX_INTEGRANTES = 2;

const GITHUB_USERNAME_REGEX = new RegExp(`^${GITHUB_USERNAME_PATTERN}$`);

// Usuario de GitHub: sólo el chequeo de formato (regex). No normaliza — para
// eso está `normalizarGithubUsername` más abajo; se combinan en el caller
// cuando hace falta (ej. `Alumno.validateRegistro`, `Docente.validarAlta`).
export function esGithubUsernameValido(githubUsername: string): boolean {
  return GITHUB_USERNAME_REGEX.test(githubUsername.trim());
}

// Fase 4 de la auditoría de dominio: única fuente para los paradigmas y los
// tipos de assignment — antes `Paradigma`/`PARADIGMAS` y `TipoAssignment`
// vivían sueltos en `@/types` (sin una constante para `TipoAssignment`) y
// se repetían como arrays literales en los `@Enum({ items })` de
// `Assignment.ts`/`Grupo.ts`, en `assignment-schema.ts` y en el `<select>`
// de `assignment-form.tsx`. Mismo idioma que `NOMBRES_RESULTADO_CI` en
// `ResultadoCI.ts`: el tipo se deriva del array, no al revés.
export const PARADIGMAS = ["funcional", "logico", "objetos"] as const;
export type Paradigma = (typeof PARADIGMAS)[number];

export const TIPOS_ASSIGNMENT = ["individual", "grupal"] as const;
export type TipoAssignment = (typeof TIPOS_ASSIGNMENT)[number];

// Quién puede integrar un `Grupo` (issue #107/#112): un grupo de alumnos
// (el caso de siempre) o un grupo de docentes armado para la demo de Mis
// TPs. Lo fija el creador al crear el grupo (`GrupalAssignment.crearGrupo`)
// y no cambia después — separa por completo el cupo y el selector de un
// tipo del otro (`Grupo.admiteIntegrantesDe`).
export const TIPOS_DE_INTEGRANTES = ["alumnos", "docentes"] as const;
export type TipoDeIntegrantes = (typeof TIPOS_DE_INTEGRANTES)[number];

export function normalizarGithubUsername(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}
