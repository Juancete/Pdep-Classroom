import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { internalErrorSinPersistencia } from "@/lib/api-errors";
import { getUnreadErrorLogCount } from "@/lib/repositories";

const ROUTE = "GET /api/admin/errores/count";

export async function GET() {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  try {
    const unread = await getUnreadErrorLogCount();
    return NextResponse.json(
      { unread },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return internalErrorSinPersistencia(ROUTE, error);
  }
}
