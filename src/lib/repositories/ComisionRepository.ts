import { getEM, deleteEntity } from "@/lib/db";
import { Comision } from "@/domain/entities";
import { type ColumnConfig, DEFAULT_COLUMN_CONFIG } from "@/types";

export interface ComisionFormData {
  anio: number;
  spreadsheetId: string;
  activa: boolean;
  columnConfig?: ColumnConfig;
}

export async function getComisiones(): Promise<Comision[]> {
  const em = await getEM();
  return em.find(Comision, {}, { orderBy: { anio: "DESC" } });
}

export async function getComision(id: string): Promise<Comision | null> {
  const em = await getEM();
  return em.findOne(Comision, { id });
}

export async function getComisionActiva(): Promise<Comision | null> {
  const em = await getEM();
  return em.findOne(Comision, { activa: true });
}

export async function createComision(data: ComisionFormData): Promise<Comision> {
  const em = await getEM();

  if (data.activa) {
    await em.nativeUpdate(Comision, {}, { activa: false });
  }

  const comision = new Comision(data.anio, data.spreadsheetId);
  comision.activa = data.activa;
  comision.columnConfig = data.columnConfig ?? { ...DEFAULT_COLUMN_CONFIG };

  em.persist(comision);
  await em.flush();
  return comision;
}

export async function updateComision(
  id: string,
  data: Partial<ComisionFormData>
): Promise<Comision | null> {
  const em = await getEM();
  const comision = await em.findOne(Comision, { id });
  if (!comision) return null;

  if (data.activa) {
    await em.nativeUpdate(Comision, { id: { $ne: id } }, { activa: false });
  }

  if (data.anio !== undefined) comision.anio = data.anio;
  if (data.spreadsheetId !== undefined) comision.spreadsheetId = data.spreadsheetId;
  if (data.activa !== undefined) comision.activa = data.activa;
  if (data.columnConfig !== undefined) comision.columnConfig = data.columnConfig;

  await em.flush();
  return comision;
}

export async function deleteComision(id: string): Promise<void> {
  await deleteEntity(Comision, id);
}
