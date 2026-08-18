import { NextResponse } from "next/server";
import { logger } from "./logger";
import {
  AssignmentNoEncontradoError,
  AssignmentNoDisponibleError,
  AccesoAssignmentProhibidoError,
  GrupoNoEncontradoError,
  AssignmentNoGrupalError,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
  GrupoLlenoError,
} from "@/domain/entities";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";

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

type RespuestaDeError = {
  status: number;
  // Si se omite, se usa `error.message` — la mayoría de los errores de
  // dominio ya tienen un mensaje amigable pensado para mostrarse tal cual.
  mensaje?: string;
};

type ConstructorDeError = new (...args: never[]) => Error;

// Tabla error de dominio → respuesta HTTP. Reemplaza la cadena repetida de
// `if (error instanceof X) return NextResponse.json(...)` que se copiaba en
// cada route handler — acá es un dato consultable por tipo de error, no una
// rama de lógica nueva por cada `catch`.
//
// Perezosa a propósito: si se construyera al importar el módulo, cualquier
// test que mockee `@/domain/entities` de forma parcial (sin las clases de
// error que no le interesan) rompería con un `import` fallido, aunque ese
// test no use `respuestaDeErrorDeDominio` en absoluto. Se arma una sola vez,
// en el primer llamado real.
let respuestasPorError: Map<ConstructorDeError, RespuestaDeError> | null = null;

function getRespuestasPorError(): Map<ConstructorDeError, RespuestaDeError> {
  if (!respuestasPorError) {
    respuestasPorError = new Map<ConstructorDeError, RespuestaDeError>([
      [AssignmentNoEncontradoError, { status: 404 }],
      [GrupoNoEncontradoError, { status: 404 }],
      [AccesoAssignmentProhibidoError, { status: 403 }],
      [AssignmentNoDisponibleError, { status: 403 }],
      [AssignmentNoGrupalError, { status: 400, mensaje: "Este assignment no es grupal" }],
      [NombreGrupoInvalidoError, { status: 400 }],
      [NombreRepositorioDemasiadoLargoError, { status: 400 }],
      [InscripcionesCerradasError, { status: 409, mensaje: "Las inscripciones a grupos están cerradas" }],
      [AlumnoYaEnGrupoDelAssignmentError, { status: 409, mensaje: "Ya estás en un grupo para este TP" }],
      [GrupoLlenoError, { status: 409, mensaje: "El grupo ya está completo" }],
      [NombreGrupoDuplicadoError, { status: 409 }],
    ]);
  }
  return respuestasPorError;
}

/**
 * Traduce un error de dominio conocido a su `NextResponse` HTTP. Devuelve
 * `null` si el error no está en la tabla — el caller debe entonces tratarlo
 * como inesperado (`internalServerError`). Patrón de uso en cada route:
 *
 *   } catch (error) {
 *     return respuestaDeErrorDeDominio(error) ?? internalServerError(route, error, {...});
 *   }
 */
export function respuestaDeErrorDeDominio(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null;
  const respuesta = getRespuestasPorError().get(
    error.constructor as ConstructorDeError
  );
  if (!respuesta) return null;
  return NextResponse.json(
    { error: respuesta.mensaje ?? error.message },
    { status: respuesta.status }
  );
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
