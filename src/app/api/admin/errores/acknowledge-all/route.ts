import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { internalErrorSinPersistencia } from "@/lib/api-errors";
import { acknowledgeAllErrorLogs } from "@/lib/repositories";

const ROUTE = "POST /api/admin/errores/acknowledge-all";

export async function POST() {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  try {
    const acknowledged = await acknowledgeAllErrorLogs();
    return NextResponse.json({ acknowledged });
  } catch (error) {
    return internalErrorSinPersistencia(ROUTE, error);
  }
}
