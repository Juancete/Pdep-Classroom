import {
  normalizarGithubUsername,
  PARADIGMAS,
  type Paradigma,
  TIPOS_ASSIGNMENT,
  type TipoAssignment,
  TIPOS_DE_INTEGRANTES,
  type TipoDeIntegrantes,
} from "@/domain/entities/domain-constants";
import type { RolDeUsuario } from "@/domain/entities/RolDeUsuario";
export { normalizarGithubUsername };

// ── Paradigmas ──────────────────────────────────────────────
// Fuente única en `domain-constants.ts` (Fase 4 de la auditoría de
// dominio) — acá sólo se reexportan para no romper a los callers que ya
// importan `Paradigma`/`PARADIGMAS`/`TipoAssignment` desde `@/types`.
export { PARADIGMAS, type Paradigma, TIPOS_ASSIGNMENT, type TipoAssignment };
export { TIPOS_DE_INTEGRANTES, type TipoDeIntegrantes };

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

// "separado": apellido y nombre en columnas propias (default, cursada nueva).
// "completo": ya vienen consolidados en una sola columna "Apellido, Nombre"
// (cursada en marcha con planilla preexistente).
export type ModoNombre = "separado" | "completo";

export interface ColumnConfig {
  sheetName: string;   // nombre de la hoja, ej: "Alumnos"
  headerRows: number;  // filas de encabezado a saltear (default 1)
  legajo: number;           // 0-indexed, default 0 (A)
  apellido: number;         // default 1 (B)
  nombre: number;           // default 2 (C)
  githubUsername: number;   // default 3 (D)
  email: number;            // default 4 (E)
  grupos?: GruposColumnConfig;  // opcional: hoja de grupos
  modoNombre?: ModoNombre;             // ausente ⇒ "separado"
  nombreCompleto?: number;             // sólo se usa en modo "completo"
  permitirPrecargaSinLegajo?: boolean; // ausente ⇒ false
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

// Forma en la que viaja la identidad DENTRO del objeto de sesión de NextAuth.
// A partir de #83 no incluye el rol: `RolDeUsuario` se resuelve por request
// en `getCurrentUser()` (ver el comentario en `auth.config.ts`), nunca desde
// un valor guardado en el JWT — un docente puede darse de baja entre
// una request y la siguiente, y el JWT no se invalida en ese momento.
export interface SessionPdepUser {
  githubUsername: string;
  name: string;
  image: string;
}

export function usernameCanonicoDe(user: PdepUser): string {
  return normalizarGithubUsername(user.githubUsername);
}
