import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { getComision, deleteComision } from "@/lib/repositories";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  const existing = await getComision(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Comisión no encontrada" }, { status: 404 });
  }

  await deleteComision(params.id);
  return NextResponse.json({ ok: true });
}
