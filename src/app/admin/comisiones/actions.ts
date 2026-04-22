"use server";

import { requireAdmin } from "@/lib/session";
import { createComision, updateComision, getComision, upsertAlumnos, LegajoConflictError } from "@/lib/repositories";
import { getAlumnos } from "@/lib/sheets";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_COLUMN_CONFIG } from "@/types";

export type ComisionFormState =
  | { ok: false; errors: Record<string, string[] | undefined> }
  | null;

const ColumnIndexSchema = z.coerce
  .number({ invalid_type_error: "Debe ser un número de columna" })
  .int()
  .min(0, "Columna inválida")
  .max(25, "Columna inválida");

const ComisionSchema = z.object({
  anio: z.coerce
    .number({ invalid_type_error: "El año es obligatorio" })
    .int()
    .min(2020, "Año inválido")
    .max(2100, "Año inválido"),
  spreadsheetId: z.string().min(1, "El ID de la planilla es obligatorio"),
  activa: z.coerce.boolean().optional().transform((v) => v ?? false),
  sheetName: z.string().min(1, "El nombre de la hoja es obligatorio"),
  headerRows: z.coerce.number().int().min(0).max(10),
  col_legajo: ColumnIndexSchema,
  col_apellido: ColumnIndexSchema,
  col_nombre: ColumnIndexSchema,
  col_githubUsername: ColumnIndexSchema,
  col_email: ColumnIndexSchema,
});

function parseFormData(formData: FormData) {
  return {
    anio: formData.get("anio") ?? undefined,
    spreadsheetId: (formData.get("spreadsheetId") as string) || "",
    activa: formData.get("activa") === "on",
    sheetName: (formData.get("sheetName") as string) || DEFAULT_COLUMN_CONFIG.sheetName,
    headerRows: formData.get("headerRows") ?? DEFAULT_COLUMN_CONFIG.headerRows,
    col_legajo: formData.get("col_legajo") ?? DEFAULT_COLUMN_CONFIG.legajo,
    col_apellido: formData.get("col_apellido") ?? DEFAULT_COLUMN_CONFIG.apellido,
    col_nombre: formData.get("col_nombre") ?? DEFAULT_COLUMN_CONFIG.nombre,
    col_githubUsername: formData.get("col_githubUsername") ?? DEFAULT_COLUMN_CONFIG.githubUsername,
    col_email: formData.get("col_email") ?? DEFAULT_COLUMN_CONFIG.email,
  };
}

function toColumnConfig(data: z.infer<typeof ComisionSchema>) {
  return {
    sheetName: data.sheetName,
    headerRows: data.headerRows,
    legajo: data.col_legajo,
    apellido: data.col_apellido,
    nombre: data.col_nombre,
    githubUsername: data.col_githubUsername,
    email: data.col_email,
  };
}

export async function crearComision(
  _prevState: ComisionFormState,
  formData: FormData
): Promise<ComisionFormState> {
  await requireAdmin();

  const raw = parseFormData(formData);
  const result = ComisionSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  const { anio, spreadsheetId, activa } = result.data;
  await createComision({ anio, spreadsheetId, activa, columnConfig: toColumnConfig(result.data) });
  redirect("/admin/comisiones");
}

export async function actualizarComision(
  _prevState: ComisionFormState,
  formData: FormData
): Promise<ComisionFormState> {
  await requireAdmin();

  const id = formData.get("id") as string;
  const raw = parseFormData(formData);
  const result = ComisionSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  const { anio, spreadsheetId, activa } = result.data;
  await updateComision(id, { anio, spreadsheetId, activa, columnConfig: toColumnConfig(result.data) });
  redirect("/admin/comisiones");
}

export type SyncState =
  | { status: "idle" }
  | { status: "ok"; sincronizados: number }
  | { status: "error"; message: string };

export async function sincronizarAlumnos(
  _prevState: SyncState,
  formData: FormData
): Promise<SyncState> {
  await requireAdmin();

  const id = formData.get("comisionId") as string;
  const comision = await getComision(id);
  if (!comision) return { status: "error", message: "Comisión no encontrada" };

  let alumnos;
  try {
    alumnos = await getAlumnos(comision.spreadsheetId, comision.columnConfig);
  } catch (e) {
    return { status: "error", message: `No se pudo leer la planilla: ${(e as Error).message}` };
  }

  let sincronizados: number;
  try {
    sincronizados = await upsertAlumnos(alumnos.map((alumno) => ({ ...alumno, comision })));
  } catch (e) {
    if (e instanceof LegajoConflictError) {
      return { status: "error", message: e.message };
    }
    throw e;
  }

  revalidatePath("/admin/comisiones");
  return { status: "ok", sincronizados };
}
