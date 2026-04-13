import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { getAssignment, deleteAssignment, updateAssignment } from "@/lib/repositories";

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

  const body = await req.json();
  const updated = await updateAssignment(params.id, body);
  return NextResponse.json(updated);
}
