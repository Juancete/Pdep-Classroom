import type { EntityManager } from "@mikro-orm/postgresql";

export type ContextoDeAcceso = {
  assignmentId: string;
  grupoId: string;
  githubUsername: string;
};

/**
 * Acceso de un integrante al repo de la entrega de su grupo. Son dos métodos
 * y no un `sincronizar(accion)` a propósito: un parámetro "alta" | "baja"
 * sería un `if` por tipo dentro de la implementación.
 */
export interface AccesoAlRepositorioDeGrupo {
  otorgarA(contexto: ContextoDeAcceso, transaction: EntityManager): Promise<void>;
  revocarA(contexto: ContextoDeAcceso, transaction: EntityManager): Promise<void>;
}
