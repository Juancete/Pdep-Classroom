import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { getAssignment, deleteAssignment, updateAssignment } from "@/lib/repositories";
import { AssignmentBaseSchema } from "@/lib/assignment-schema";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  const existing = await getAssignment(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  await deleteAssignment(params.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  const existing = await getAssignment(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AssignmentBaseSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const updated = await updateAssignment(params.id, parsed.data);
  return NextResponse.json(updated);
}
