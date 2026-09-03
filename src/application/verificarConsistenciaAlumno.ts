import { logger } from "@/lib/logger";
import type { Comision } from "@/domain/entities";
import {
  getAlumnoByGithub,
  marcarAlumnoSyncFallido,
  marcarAlumnoSyncOk,
} from "@/infrastructure/repositories";
import { upsertarAlumnoEnSheets } from "@/infrastructure/sheets";

/**
 * Re-refleja en la planilla los datos del alumno guardados en la DB.
 *
 * Source-of-truth para el alta del alumno: la DB (lo que el alumno completó
 * en el form). Si alguien editó la fila en Sheets a mano, este comando la
 * vuelve a alinear escribiendo los datos canónicos.
 *
 * Es idempotente: `upsertarAlumnoEnSheets` ya respeta columnas desconocidas
 * y hace find-or-append por githubUsername. Llamarlo cuando los datos ya
 * coinciden es un write innecesario pero seguro.
 *
 * Persiste el resultado en `alumnoSyncFallidoEn` (análogo al flag de grupos):
 * se prende ante cualquier falla y se limpia cuando un reintento exitoso lo
 * resuelve. La persistencia del flag es best-effort: si escribir el flag
 * también falla, se loguea pero se propaga el error original.
 */
export async function verificarConsistenciaAlumno(
  githubUsername: string,
  comision: Comision
): Promise<void> {
  const alumno = await getAlumnoByGithub(githubUsername);
  if (!alumno) return;

  try {
    const resultado = await upsertarAlumnoEnSheets(
      alumno.toRegistroInput(),
      comision.spreadsheetId,
      comision.columnConfig
    );
    if (!resultado.ok) throw new Error(resultado.error);
  } catch (error) {
    logger.error(
      {
        err: error,
        githubUsername: alumno.githubUsername,
        comisionId: comision.id,
      },
      "Falló re-upsert del alumno en planilla"
    );
    try {
      await marcarAlumnoSyncFallido(alumno.githubUsername);
    } catch (flagError) {
      logger.error(
        { err: flagError, githubUsername: alumno.githubUsername },
        "Falló al persistir alumnoSyncFallidoEn (banner no aparecerá)"
      );
    }
    throw error;
  }

  await marcarAlumnoSyncOk(alumno.githubUsername);
}
