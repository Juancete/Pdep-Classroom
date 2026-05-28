import { NextResponse } from "next/server";
import { logger } from "./logger";

/**
 * Parsea el body de un request JSON y verifica que sea un objeto plano.
 * Devuelve el objeto si es válido, o una `NextResponse` 400 si no lo es
 * (body no-JSON, null, array). Usar `.catch()` internamente evita que un
 * body mal formado propague una excepción y termine devolviendo 500.
 *
 * Patrón de uso:
 *   const body = await parseJsonObjectBody(req);
 *   if (body instanceof NextResponse) return body;
 */
export async function parseJsonObjectBody(
  req: Request
): Promise<Record<string, unknown> | NextResponse> {
  const body = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "No pudimos leer los datos enviados. Volvé a intentar." },
      { status: 400 }
    );
  }
  return body as Record<string, unknown>;
}

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
