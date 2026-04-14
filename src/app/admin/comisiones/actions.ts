"use server";

import { requireAdmin } from "@/lib/session";
import { createComision, updateComision } from "@/lib/repositories";
import { redirect } from "next/navigation";
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
  col_comision: ColumnIndexSchema,
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
    col_comision: formData.get("col_comision") ?? DEFAULT_COLUMN_CONFIG.comision,
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
    comision: data.col_comision,
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
