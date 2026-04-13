import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getComision, deleteComision } from "@/lib/repositories";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const existing = await getComision(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Comisión no encontrada" }, { status: 404 });
  }

  await deleteComision(params.id);
  return NextResponse.json({ ok: true });
}
