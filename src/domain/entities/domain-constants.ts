export const ALUMNO_LEGAJO_PATTERN = "\\d{4,8}";
export const ALUMNO_EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";
export const COMISION_ANIO_MIN = 2020;
export const COMISION_ANIO_MAX = 2100;
export const GRUPAL_MIN_MAX_INTEGRANTES = 2;

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

export function normalizarGithubUsername(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}
