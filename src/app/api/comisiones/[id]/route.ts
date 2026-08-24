import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import {
  ComisionNoEliminableError,
  getComision,
  deleteComision,
} from "@/lib/repositories";
import { internalServerError } from "@/lib/api-errors";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  const existing = await getComision(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Comisión no encontrada" }, { status: 404 });
  }

  try {
    await deleteComision(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ComisionNoEliminableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return internalServerError("DELETE /api/comisiones/[id]", error, {
      comisionId: params.id,
    });
  }
}
