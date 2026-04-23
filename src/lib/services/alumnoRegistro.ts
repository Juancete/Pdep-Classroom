import { upsertarAlumnoEnSheets, validateRegistro, type RegistroInput } from "@/lib/sheets";
import {
  getComisionActiva,
  upsertAlumno,
  marcarRegistroConfirmado,
  LegajoConflictError,
} from "@/lib/repositories";
import { Comision } from "@/domain/entities";
import { logger } from "@/lib/logger";

/**
 * Resultado de `confirmarDatosAlumno` — discriminated union con el status HTTP
 * sugerido y, cuando aplica, el `field` para que el form lo pinte inline. En
 * el caso OK devolvemos la `comision` para que el handler pueda encadenar
 * acciones accesorias (sync de grupos, Google Groups) sin volver a consultarla.
 */
export type ResultadoConfirmacion =
  | { ok: true; comision: Comision }
  | {
      ok: false;
      status: 400 | 409;
      error: string;
      field?: "legajo" | "githubUsername";
    };

/**
 * Lógica compartida entre `POST /api/registro` y `PATCH /api/perfil`:
 * valida los datos del alumno, persiste en DB (DB-primero para atomicidad
 * sobre legajo↔github) y refleja en la planilla.
 *
 * El handler es quien agrega lo específico: registro hace la validación de
 * coherencia github↔sesión antes de llamar, y después de un resultado OK
 * dispara los hooks accesorios (Google Groups, sync de grupos desde planilla).
 */
export async function confirmarDatosAlumno(
  input: RegistroInput
): Promise<ResultadoConfirmacion> {
  const comisionActiva = await getComisionActiva();
  if (!comisionActiva) {
    return {
      ok: false,
      status: 409,
      error:
        "No hay una comisión activa con planilla configurada. Pedile a un admin que configure una en /admin/comisiones.",
    };
  }

  const validationError = validateRegistro(input);
  if (validationError) {
    return { ok: false, status: 400, error: validationError };
  }

  // DB primero: valida legajo↔github atómicamente. Si falla, Sheets no se
  // toca — evita el TOCTOU del check previo contra Sheets.
  //
  // El alumno se persiste SIN `registroConfirmadoEn`: ese flag se escribe
  // recién cuando Sheets confirmó la escritura (ver `marcarRegistroConfirmado`
  // más abajo). Así evitamos dejar la DB marcada como confirmada si la
  // planilla falla a mitad de camino.
  try {
    await upsertAlumno({
      legajo: input.legajo,
      nombre: input.nombre,
      apellido: input.apellido,
      githubUsername: input.githubUsername,
      email: input.email,
      comision: comisionActiva,
    });
  } catch (error) {
    if (error instanceof LegajoConflictError) {
      return { ok: false, status: 400, error: error.message, field: "legajo" };
    }
    throw error;
  }

  const resultadoSheets = await upsertarAlumnoEnSheets(
    input,
    comisionActiva.spreadsheetId,
    comisionActiva.columnConfig
  );

  if (!resultadoSheets.ok) {
    return { ok: false, status: 400, error: resultadoSheets.error };
  }

  try {
    await marcarRegistroConfirmado(input.githubUsername, comisionActiva);
  } catch (error) {
    // Caso raro: Sheets ya confirmó pero el UPDATE local falló. El registro
    // queda "a medias" — alumno en DB sin flag, fila en la planilla — y el
    // próximo reintento del alumno reconvergea (upsertAlumno y Sheets son
    // idempotentes). Lo logueamos específicamente para que el admin lo vea
    // distinto de un 500 común.
    logger.error(
      {
        err: error,
        githubUsername: input.githubUsername,
        comisionId: comisionActiva.id,
      },
      "Sheets confirmado pero falló marcar registroConfirmadoEn en DB — alumno queda sin flag hasta que reintente"
    );
    throw error;
  }

  return { ok: true, comision: comisionActiva };
}
