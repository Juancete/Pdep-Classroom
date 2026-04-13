"use server";

import { requireAdmin } from "@/lib/session";
import { createComision, updateComision } from "@/lib/repositories";
import { redirect } from "next/navigation";
import { z } from "zod";

export type ComisionFormState =
  | { ok: false; errors: Record<string, string[] | undefined> }
  | null;

const ComisionSchema = z.object({
  anio: z.coerce
    .number({ invalid_type_error: "El año es obligatorio" })
    .int()
    .min(2020, "Año inválido")
    .max(2100, "Año inválido"),
  spreadsheetId: z.string().min(1, "El ID de la planilla es obligatorio"),
  activa: z.coerce.boolean().optional().transform((v) => v ?? false),
});

function parseFormData(formData: FormData) {
  return {
    anio: formData.get("anio") ?? undefined,
    spreadsheetId: (formData.get("spreadsheetId") as string) || "",
    activa: formData.get("activa") === "on",
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

  await createComision(result.data);
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

  await updateComision(id, result.data);
  redirect("/admin/comisiones");
}
