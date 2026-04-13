// ── Paradigmas ──────────────────────────────────────────────

export type Paradigma = "funcional" | "logico" | "objetos";

export const PARADIGMAS: Paradigma[] = ["funcional", "logico", "objetos"];

// ── Assignment ──────────────────────────────────────────────

export type TipoAssignment = "individual" | "grupal";

// ── Session extendida ───────────────────────────────────────

export interface PdepUser {
  githubUsername: string;
  name: string;
  image: string;
  isAdmin: boolean;
}
