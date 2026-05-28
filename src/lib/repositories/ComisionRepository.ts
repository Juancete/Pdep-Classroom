import { getEM, deleteEntity } from "@/lib/db";
import { Comision } from "@/domain/entities";
import { type ColumnConfig, DEFAULT_COLUMN_CONFIG } from "@/types";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";

export class ComisionActivaDuplicadaError extends Error {
  constructor() {
    super("Ya existe otra comisión activa.");
    this.name = "ComisionActivaDuplicadaError";
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
  await deleteEntity(Comision, id);
}
