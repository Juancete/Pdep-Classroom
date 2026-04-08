"use server";

import { requireAdmin } from "@/lib/session";
import { createAssignment, updateAssignment } from "@/lib/store";
import { slugify } from "@/lib/naming";
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

  const { titulo, slug, ...rest } = result.data;
  await createAssignment({ titulo, slug: slug || slugify(titulo), ...rest });

  redirect("/admin/assignments");
}

export async function actualizarAssignment(
  id: string,
  _prevState: AssignmentFormState,
  formData: FormData
): Promise<AssignmentFormState> {
  await requireAdmin();

  const raw = parseFormData(formData);
  const result = AssignmentSchema.safeParse(raw);

  if (!result.success) {
    return { ok: false, errors: result.error.flatten().fieldErrors };
  }

  const { titulo, slug, ...rest } = result.data;
  await updateAssignment(id, { titulo, slug: slug || slugify(titulo), ...rest });

  redirect("/admin/assignments");
}
