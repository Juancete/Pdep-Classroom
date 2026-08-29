import {
  normalizarGithubUsername,
  PARADIGMAS,
  type Paradigma,
  TIPOS_ASSIGNMENT,
  type TipoAssignment,
} from "@/domain/entities/domain-constants";
import type { RolDeUsuario, NombreRolDeUsuario } from "@/domain/entities/RolDeUsuario";
export { normalizarGithubUsername };

// ── Paradigmas ──────────────────────────────────────────────
// Fuente única en `domain-constants.ts` (Fase 4 de la auditoría de
// dominio) — acá sólo se reexportan para no romper a los callers que ya
// importan `Paradigma`/`PARADIGMAS`/`TipoAssignment` desde `@/types`.
export { PARADIGMAS, type Paradigma, TIPOS_ASSIGNMENT, type TipoAssignment };

// ── Configuración de columnas del spreadsheet ───────────────

// Configuración opcional para leer grupos desde la planilla.
// Se modela con una columna por paradigma porque la planilla típica tiene
// headers tipo "Nombre grupo funcional", "Nombre grupo lógico", etc. Si sólo
// hay grupos para un paradigma, se completa solo esa entrada.
export interface GruposColumnConfig {
  sheetName: string;
  headerRows: number;
  githubUsername: number;
  nombreGrupoPorParadigma: Partial<Record<Paradigma, number>>;
}

export interface ColumnConfig {
  sheetName: string;   // nombre de la hoja, ej: "Alumnos"
  headerRows: number;  // filas de encabezado a saltear (default 1)
  legajo: number;           // 0-indexed, default 0 (A)
  apellido: number;         // default 1 (B)
  nombre: number;           // default 2 (C)
  githubUsername: number;   // default 3 (D)
  email: number;            // default 4 (E)
  grupos?: GruposColumnConfig;  // opcional: hoja de grupos
}

export const DEFAULT_COLUMN_CONFIG: ColumnConfig = {
  sheetName: "Alumnos",
  headerRows: 1,
  legajo: 0,
  apellido: 1,
  nombre: 2,
  githubUsername: 3,
  email: 4,
};

// ── Assignment ──────────────────────────────────────────────

export type { NombreEstadoAssignment } from "@/domain/entities/EstadoAssignment";

// ── Session extendida ───────────────────────────────────────

export interface PdepUser {
  githubUsername: string;
  name: string;
  image: string;
  rol: RolDeUsuario;
}

// Forma en la que el rol viaja DENTRO del objeto de sesión de NextAuth: un
// nombre primitivo, no la instancia de `RolDeUsuario` (ver el comentario de
// `NombreRolDeUsuario`). Todo lo que lee `session.pdepUser` directamente
// (en vez de pasar por `getCurrentUser()`) tiene que reconstruir el rol real
// con `rolDesdeNombre(...)` antes de llamar cualquier método sobre él.
export interface SessionPdepUser {
  githubUsername: string;
  name: string;
  image: string;
  rolNombre: NombreRolDeUsuario;
}

export function usernameCanonicoDe(user: PdepUser): string {
  return normalizarGithubUsername(user.githubUsername);
}
