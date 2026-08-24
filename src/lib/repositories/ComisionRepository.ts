import { getEM } from "@/lib/db";
import { Alumno, Assignment, Comision } from "@/domain/entities";
import { LockMode } from "@mikro-orm/core";
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
      comision.activa = false;
      comision.columnConfig = data.columnConfig ?? { ...DEFAULT_COLUMN_CONFIG };

      entityManager.persist(comision);
      await entityManager.flush();
      return comision;
    }

    return entityManager.transactional(async (transaction) => {
      await transaction.nativeUpdate(Comision, {}, { activa: false });

      const comision = new Comision(data.anio, data.spreadsheetId);
      comision.activa = true;
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
      if (data.activa !== undefined) comision.activa = data.activa;
      if (data.columnConfig !== undefined) comision.columnConfig = data.columnConfig;

      await entityManager.flush();
      return comision;
    }

    return entityManager.transactional(async (transaction) => {
      const comision = await transaction.findOne(Comision, { id });
      if (!comision) return null;

      await transaction.nativeUpdate(Comision, { id: { $ne: id } }, { activa: false });

      if (data.anio !== undefined) comision.anio = data.anio;
      if (data.spreadsheetId !== undefined) comision.spreadsheetId = data.spreadsheetId;
      comision.activa = true;
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

export async function marcarGruposImportados(id: string): Promise<void> {
  const entityManager = await getEM();
  const comision = await entityManager.findOneOrFail(Comision, { id });
  comision.gruposImportadosEn = new Date();
  await entityManager.flush();
}
