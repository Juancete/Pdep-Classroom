export const ALUMNO_LEGAJO_PATTERN = "\\d{4,8}";
export const ALUMNO_EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";
export const COMISION_ANIO_MIN = 2020;
export const COMISION_ANIO_MAX = 2100;
export const GRUPAL_MIN_MAX_INTEGRANTES = 2;

export function normalizarGithubUsername(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}
