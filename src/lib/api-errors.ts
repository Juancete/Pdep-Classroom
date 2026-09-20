import { NextResponse, after } from "next/server";
import { logger } from "./logger";
import { prepararErrorLog } from "./error-log";
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
  AlumnoNoEsMiembroDelGrupoError,
  GrupoConEntregaError,
  GrupoNoAdmiteParticipanteError,
  EntregaNoEncontradaError,
  EntregaConProvisionEnCursoError,
  ColaboradorNoInvitableError,
} from "@/domain/entities";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";
import { PermisosNoVerificablesError } from "@/infrastructure/auth/PermisosNoVerificablesError";
// Import directo (no desde `sheets.ts`) para no arrastrar `googleapis` a
// cada route handler que sólo necesita mapear el error a una respuesta HTTP.
import { PlanillaNoDisponibleError } from "@/infrastructure/PlanillaNoDisponibleError";

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
  // El error también se persiste en `error_log` para el admin, además de
  // responder con el mensaje amigable. Sólo tiene efecto si el caller de
  // `respuestaDeErrorDeDominio` pasa el segundo parámetro `registro`.
  registrar?: true;
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
      [EntregaNoEncontradaError, { status: 404 }],
      [AccesoAssignmentProhibidoError, { status: 403 }],
      [AssignmentNoDisponibleError, { status: 403 }],
      [AssignmentNoGrupalError, { status: 400, mensaje: "Este assignment no es grupal" }],
      [NombreGrupoInvalidoError, { status: 400 }],
      [NombreRepositorioDemasiadoLargoError, { status: 400 }],
      [InscripcionesCerradasError, { status: 409, mensaje: "Las inscripciones a grupos están cerradas" }],
      [AlumnoYaEnGrupoDelAssignmentError, { status: 409, mensaje: "Ya estás en un grupo para este TP" }],
      [GrupoLlenoError, { status: 409, mensaje: "El grupo ya está completo" }],
      [NombreGrupoDuplicadoError, { status: 409 }],
      [GrupoConEntregaError, { status: 409 }],
      [AlumnoNoEsMiembroDelGrupoError, { status: 409 }],
      [GrupoNoAdmiteParticipanteError, { status: 409 }],
      [EntregaConProvisionEnCursoError, { status: 409 }],
      [ColaboradorNoInvitableError, { status: 409 }],
      [PermisosNoVerificablesError, { status: 503 }],
      [
        PlanillaNoDisponibleError,
        {
          status: 503,
          registrar: true,
          mensaje:
            "Tus datos quedaron guardados, pero no pudimos actualizar la planilla de la cátedra. Reintentá en unos minutos y, si persiste, avisale a un docente.",
        },
      ],
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
 *
 * El segundo parámetro `registro` es opcional: sólo se usa cuando la entrada
 * de la tabla tiene `registrar: true` (errores de dominio que igual conviene
 * que el admin vea en `/admin/errores`, ej. `PlanillaNoDisponibleError`). Sin
 * `registro`, ese error no se persiste — mantiene el comportamiento actual
 * para todos los callers que no lo pasan.
 */
export function respuestaDeErrorDeDominio(
  error: unknown,
  registro?: { route: string; context?: Record<string, unknown> }
): NextResponse | null {
  if (!(error instanceof Error)) return null;
  const respuesta = getRespuestasPorError().get(
    error.constructor as ConstructorDeError
  );
  if (!respuesta) return null;
  if (respuesta.registrar && registro) {
    registrarErrorOperativo(registro.route, error, registro.context);
  }
  return NextResponse.json(
    { error: respuesta.mensaje ?? error.message },
    { status: respuesta.status }
  );
}

// Loggea el error completo server-side (Pino) y programa su persistencia
// sanitizada en `error_log` para la pantalla admin. Compartido por
// `internalServerError` (500 genérico), `respuestaDeErrorDeDominio` (errores
// de dominio con `registrar: true`, que responden con su propio status y
// mensaje amigable pero igual conviene que el admin vea) y por handlers que
// responden 200 pero quieren dejar rastro de un fallo parcial (ej.
// `POST /api/assignments/[id]/ci` cuando `sincronizarCIDeEntregas` devuelve
// `fallidas`).
export function registrarErrorOperativo(
  route: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  logger.error({ ...context, err: error, route }, "handler error");
  try {
    const errorLog = prepararErrorLog(route, error, context);
    after(async () => {
      try {
        // Import perezoso: las rutas que sólo construyen una respuesta 500 no
        // cargan MikroORM en su grafo inicial (mismo criterio que auth.events).
        const { registrarErrorInesperado } = await import(
          "@/infrastructure/repositories/ErrorLogRepository"
        );
        await registrarErrorInesperado(errorLog);
      } catch (persistenceError) {
        logger.error(
          { err: persistenceError, route },
          "no se pudo persistir el error del handler"
        );
      }
    });
  } catch (schedulingError) {
    logger.error(
      { err: schedulingError, route },
      "no se pudo programar la persistencia del error del handler"
    );
  }
}

// Devuelve siempre un 500 con mensaje genérico — evita filtrar detalles
// internos (stack traces, esquemas de DB, mensajes de librerías de terceros)
// al cliente.
//
// El `context` es opcional: sirve para adjuntar IDs útiles para debugging
// (githubUsername, assignmentId, etc.). El error original queda sólo en
// Pino; una versión sanitizada y sin stack se persiste para la pantalla admin.
export function internalServerError(
  route: string,
  error: unknown,
  context?: Record<string, unknown>
): NextResponse {
  registrarErrorOperativo(route, error, context);
  return NextResponse.json(
    { error: "Error interno del servidor" },
    { status: 500 }
  );
}

/**
 * Respuesta para handlers que operan sobre `error_log`: evita intentar
 * registrar en la misma tabla cuya falla originó el error.
 */
export function internalErrorSinPersistencia(
  route: string,
  error: unknown
): NextResponse {
  logger.error({ err: error, route }, "handler error");
  return NextResponse.json(
    { error: "Error interno del servidor" },
    { status: 500 }
  );
}
