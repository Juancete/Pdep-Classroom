"use server";

import { requireAdmin } from "@/infrastructure/auth/session";
import {
  ComisionActivaRequeridaError,
  AssignmentEstructuraInmutableError,
  createAssignment,
  updateAssignment,
} from "@/infrastructure/repositories";
import { redirect } from "next/navigation";
import { AssignmentSchema, AssignmentFormState } from "@/lib/assignment-schema";

function parseFormData(formData: FormData) {
  return {
    titulo: formData.get("titulo") as string,
    slug: (formData.get("slug") as string) || "",
    descripcion: (formData.get("descripcion") as string) || "",
    templateRepo: formData.get("templateRepo") as string,
    tipo: formData.get("tipo") as string,
    paradigma: formData.get("paradigma") as string,
    deadline: (formData.get("deadline") as string) || "",
    maxIntegrantes: formData.get("maxIntegrantes") ?? undefined,
  };
}

export async function crearAssignment(
  _prevState: AssignmentFormState,
  formData: FormData
): Promise<AssignmentFormState> {
  await requireAdmin();

  const raw = parseFormData(formData);
  const result = AssignmentSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  try {
    await createAssignment(result.data);
  } catch (error) {
    if (error instanceof ComisionActivaRequeridaError) {
      return { ok: false, errors: {}, formError: error.message };
    }
    throw error;
  }

  redirect("/admin/assignments");
}

export async function actualizarAssignment(
  _prevState: AssignmentFormState,
  formData: FormData
): Promise<AssignmentFormState> {
  await requireAdmin();

  const id = formData.get("id") as string;
  const raw = parseFormData(formData);
  const result = AssignmentSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  try {
    await updateAssignment(id, result.data);
  } catch (error) {
    if (error instanceof AssignmentEstructuraInmutableError) {
      return { ok: false, errors: {}, formError: error.message };
    }
    throw error;
  }
  redirect("/admin/assignments");
}
