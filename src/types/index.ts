// ── Paradigmas ──────────────────────────────────────────────
export type Paradigma = "funcional" | "logico" | "objetos";

export const PARADIGMAS: Paradigma[] = ["funcional", "logico", "objetos"];

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

export type TipoAssignment = "individual" | "grupal";

// ── Session extendida ───────────────────────────────────────

export interface PdepUser {
  githubUsername: string;
  name: string;
  image: string;
  isAdmin: boolean;
}
