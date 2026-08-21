import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { internalErrorSinPersistencia } from "@/lib/api-errors";
import { acknowledgeErrorLog } from "@/lib/repositories";

const ROUTE = "PATCH /api/admin/errores/[id]";

export async function PATCH(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await props.params;
    const result = await acknowledgeErrorLog(id);
    if (result === "not-found") {
      return NextResponse.json({ error: "Error no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ acknowledged: result === "updated" });
  } catch (error) {
    return internalErrorSinPersistencia(ROUTE, error);
  }
}
