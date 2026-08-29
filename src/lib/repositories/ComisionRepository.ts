import { getEM } from "@/lib/db";
import { Alumno, Assignment, Comision } from "@/domain/entities";
import { LockMode } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { type ColumnConfig, DEFAULT_COLUMN_CONFIG } from "@/types";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";

export class ComisionActivaDuplicadaError extends Error {
  constructor() {
    super("Ya existe otra comisión activa.");
    this.name = "ComisionActivaDuplicadaError";
  }
}

export class ComisionNoEliminableError extends Error {
  constructor(public readonly motivo: "activa" | "alumnos" | "assignments") {
    const mensajes = {
      activa: "No se puede eliminar la comisión activa. Desactivala o activá otra comisión primero.",
      alumnos: "La comisión tiene alumnos y debe conservarse como histórico.",
      assignments: "La comisión tiene assignments y debe conservarse como histórico.",
    } as const;
    super(mensajes[motivo]);
    this.name = "ComisionNoEliminableError";
  }
}

export interface ComisionFormData {
  anio: number;
  spreadsheetId: string;
  activa: boolean;
  columnConfig?: ColumnConfig;
}

function esViolacionDeComisionActivaUnica(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = extractDbErrorCode(error);
  const message = `${error.message} ${
    error.cause instanceof Error ? error.cause.message : ""
  }`;
  return code === UNIQUE_VIOLATION && message.includes("comision_unica_activa_idx");
}

async function traducirErrorDeComisionActiva<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (esViolacionDeComisionActivaUnica(error)) {
      throw new ComisionActivaDuplicadaError();
    }
    throw error;
  }
}

export async function getComisiones(): Promise<Comision[]> {
  const entityManager = await getEM();
  return entityManager.find(Comision, {}, { orderBy: { anio: "DESC" } });
}

export async function getComision(id: string): Promise<Comision | null> {
  const entityManager = await getEM();
  return entityManager.findOne(Comision, { id });
}

export async function getComisionActiva(): Promise<Comision | null> {
  const entityManager = await getEM();
  return entityManager.findOne(Comision, { activa: true });
}

export async function createComision(data: ComisionFormData): Promise<Comision> {
  const entityManager = await getEM();

  return traducirErrorDeComisionActiva(async () => {
    if (!data.activa) {
      const comision = new Comision(data.anio, data.spreadsheetId);
      comision.desactivar();
      comision.columnConfig = data.columnConfig ?? { ...DEFAULT_COLUMN_CONFIG };

      entityManager.persist(comision);
      await entityManager.flush();
      return comision;
    }

    return entityManager.transactional(async (transaction) => {
      // Desactivación masiva: set-based a propósito (no hay "la" comisión
      // activa cargada todavía sobre la que delegar — Fase 2 de la
      // auditoría de dominio, `Comision.activar()` cubre el caso de una
      // comisión puntual).
      await transaction.nativeUpdate(Comision, {}, { activa: false });

      const comision = new Comision(data.anio, data.spreadsheetId);
      comision.activar();
      comision.columnConfig = data.columnConfig ?? { ...DEFAULT_COLUMN_CONFIG };

      transaction.persist(comision);
      await transaction.flush();
      return comision;
    });
  });
}

export async function updateComision(
  id: string,
  data: Partial<ComisionFormData>
): Promise<Comision | null> {
  const entityManager = await getEM();

  return traducirErrorDeComisionActiva(async () => {
    if (!data.activa) {
      const comision = await entityManager.findOne(Comision, { id });
      if (!comision) return null;

      if (data.anio !== undefined) comision.anio = data.anio;
      if (data.spreadsheetId !== undefined) comision.spreadsheetId = data.spreadsheetId;
      if (data.activa !== undefined) comision.desactivar();
      if (data.columnConfig !== undefined) comision.columnConfig = data.columnConfig;

      await entityManager.flush();
      return comision;
    }

    return entityManager.transactional(async (transaction) => {
      const comision = await transaction.findOne(Comision, { id });
      if (!comision) return null;

      // Desactivación masiva del resto: set-based, mismo criterio que en
      // `createComision`.
      await transaction.nativeUpdate(Comision, { id: { $ne: id } }, { activa: false });

      if (data.anio !== undefined) comision.anio = data.anio;
      if (data.spreadsheetId !== undefined) comision.spreadsheetId = data.spreadsheetId;
      comision.activar();
      if (data.columnConfig !== undefined) comision.columnConfig = data.columnConfig;

      await transaction.flush();
      return comision;
    });
  });
}

export async function deleteComision(id: string): Promise<void> {
  const entityManager = await getEM();
  await entityManager.transactional(async (transaction) => {
    const comision = await transaction.findOne(
      Comision,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!comision) return;
    if (comision.activa) throw new ComisionNoEliminableError("activa");
    if ((await transaction.count(Alumno, { comision: { id } })) > 0) {
      throw new ComisionNoEliminableError("alumnos");
    }
    if ((await transaction.count(Assignment, { comision: { id } })) > 0) {
      throw new ComisionNoEliminableError("assignments");
    }
    transaction.remove(comision);
    await transaction.flush();
  });
}

export type ReclamoImportacionGrupos =
  | { estado: "reclamada"; comision: Comision; token: string }
  | { estado: "completada" }
  | { estado: "en_proceso" }
  | { estado: "no_encontrada" };

// Delega en `Comision.gruposYaImportados`/`importacionEnProceso`/
// `reclamarImportacionDeGrupos` (Fase 2 de la auditoría de dominio) — el
// repo sólo decide el `id` a cargar/lockear, genera el `token` (id de
// infraestructura, no lo conoce la entidad) y flushea.
export async function reclamarImportacionGrupos(
  id: string
): Promise<ReclamoImportacionGrupos> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    const comision = await transaction.findOne(
      Comision,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!comision) return { estado: "no_encontrada" };
    if (comision.gruposYaImportados()) return { estado: "completada" };
    if (comision.importacionEnProceso(new Date())) return { estado: "en_proceso" };

    const token = randomUUID();
    comision.reclamarImportacionDeGrupos(token, new Date());
    await transaction.flush();
    return { estado: "reclamada", comision, token };
  });
}

// Delega en `Comision.completarImportacionDeGrupos`.
export async function completarImportacionGrupos(
  id: string,
  token: string
): Promise<boolean> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    const comision = await transaction.findOne(
      Comision,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!comision) return false;
    const completada = comision.completarImportacionDeGrupos(token, new Date());
    if (completada) await transaction.flush();
    return completada;
  });
}

// Delega en `Comision.renovarImportacion` (heartbeat del lease).
export async function renovarImportacionGrupos(
  id: string,
  token: string
): Promise<boolean> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    const comision = await transaction.findOne(
      Comision,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!comision) return false;
    const renovada = comision.renovarImportacion(token, new Date());
    if (renovada) await transaction.flush();
    return renovada;
  });
}

// Delega en `Comision.liberarImportacion`.
export async function liberarImportacionGrupos(
  id: string,
  token: string
): Promise<void> {
  const entityManager = await getEM();
  await entityManager.transactional(async (transaction) => {
    const comision = await transaction.findOne(
      Comision,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!comision) return;
    if (!comision.liberarImportacion(token)) return;
    await transaction.flush();
  });
}
