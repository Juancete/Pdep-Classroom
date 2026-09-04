import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/api-auth";
import { internalErrorSinPersistencia } from "@/lib/api-errors";
import {
  ERROR_LOG_RETENTION_DAYS,
  purgeAcknowledgedErrorLogs,
} from "@/infrastructure/repositories";

const ROUTE = "POST /api/admin/errores/purge";

export async function POST() {
  const unauthorized = await guardAdmin();
  if (unauthorized) return unauthorized;

  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - ERROR_LOG_RETENTION_DAYS);
    const deleted = await purgeAcknowledgedErrorLogs(cutoff);
    return NextResponse.json({ deleted });
  } catch (error) {
    return internalErrorSinPersistencia(ROUTE, error);
  }
}
