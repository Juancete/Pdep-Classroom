import { NextResponse } from "next/server";
import { logger } from "./logger";

// Loggea el error completo server-side y devuelve siempre un 500 con mensaje
// genérico — evita filtrar detalles internos (stack traces, esquemas de DB,
// mensajes de librerías de terceros) al cliente.
//
// El `context` es opcional: sirve para adjuntar IDs útiles para debugging
// (githubUsername, assignmentId, etc.) que quedan en el log server-side
// pero NO llegan al cliente.
//
// TODO(PR 2): extender este helper para persistir el error también en la
// tabla `error_log` (con dedup por fingerprint) y exponerlo en una pantalla
// admin con badge de no leídos. Ver issue en el README.
export function internalServerError(
  route: string,
  error: unknown,
  context?: Record<string, unknown>
): NextResponse {
  logger.error({ ...context, err: error, route }, "handler error");
  return NextResponse.json(
    { error: "Error interno del servidor" },
    { status: 500 }
  );
}
