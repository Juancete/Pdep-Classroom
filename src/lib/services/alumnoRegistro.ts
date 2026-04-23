import { upsertarAlumnoEnSheets, validateRegistro, type RegistroInput } from "@/lib/sheets";
import { getComisionActiva, upsertAlumno, LegajoConflictError } from "@/lib/repositories";

/**
 * Resultado de `confirmarDatosAlumno` — discriminated union con el status HTTP
 * sugerido y, cuando aplica, el `field` para que el form lo pinte inline.
 */
export type ResultadoConfirmacion =
  | { ok: true }
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
 * dispara el hook de Google Groups.
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
  try {
    await upsertAlumno({
      legajo: input.legajo,
      nombre: input.nombre,
      apellido: input.apellido,
      githubUsername: input.githubUsername,
      email: input.email,
      comision: comisionActiva,
      registroConfirmadoEn: comisionActiva,
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

  return { ok: true };
}
