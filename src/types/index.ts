// ── Paradigmas ──────────────────────────────────────────────

export type Paradigma = "funcional" | "logico" | "objetos";

export const PARADIGMAS: Paradigma[] = ["funcional", "logico", "objetos"];

// ── Alumno ───────────────────────────────────────────────────
// Este tipo representa los datos del alumno tanto cuando vienen
// de Google Sheets como cuando se mapean a/desde la entidad de dominio.

export interface Alumno {
  legajo: string;
  nombre: string;
  apellido: string;
  githubUsername: string;
  email: string;
  comision?: string; // "miércoles noche", etc. — presente en Sheets, opcional en DB
}

// ── Grupo ───────────────────────────────────────────────────

export interface Grupo {
  id: string;
  nombre: string;
  paradigma: Paradigma;
  miembros: string[]; // github usernames
}

// ── Assignment ──────────────────────────────────────────────

export type TipoAssignment = "individual" | "grupal";

export interface Assignment {
  id: string;
  titulo: string;
  descripcion: string;
  templateRepo: string; // "pdep-mn-utn/kata-funcional-template"
  tipo: TipoAssignment;
  paradigma: Paradigma;
  deadline: string; // ISO date
  createdAt: string;
  slug: string; // para generar nombre de repos
}

// ── Entrega (repo creado para un alumno/grupo) ──────────────

export interface Entrega {
  id: string;
  assignmentId: string;
  repoName: string;
  repoUrl: string;
  githubUsernames: string[]; // quién(es) tienen acceso
  grupoId?: string;
  createdAt: string;
}

// ── Session extendida ───────────────────────────────────────

export interface PdepUser {
  githubUsername: string;
  name: string;
  image: string;
  isAdmin: boolean;
  alumno?: Alumno;
}
