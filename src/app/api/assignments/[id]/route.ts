import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getAssignment, deleteAssignment, updateAssignment } from "@/lib/repositories";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

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
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const existing = await getAssignment(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const updated = await updateAssignment(params.id, body);
  return NextResponse.json(updated);
}
