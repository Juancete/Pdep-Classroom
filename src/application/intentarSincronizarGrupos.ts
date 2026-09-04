import { logger } from "@/lib/logger";
import type { Comision } from "@/domain/entities";
import { marcarGruposSyncFallido, marcarGruposSyncOk } from "@/infrastructure/repositories";
import type { AsignacionGrupoRow } from "@/infrastructure/sheets";
import { sincronizarGruposDelAlumno } from "./grupoSync";

/**
 * Comando que sincroniza los grupos del alumno y persiste el resultado en el
 * flag `gruposSyncFallidoEn`. Si la sync funciona: limpia el flag. Si falla:
 * loguea, prende el flag para disparar el retry automático en `/perfil`, y
 * propaga la excepción para que cada caller decida qué hacer (respuesta
 * degradada, contador de errores, silencio, etc.).
 *
 * La persistencia del flag en el camino de error es best-effort: si esa
 * escritura también falla, se loguea pero se propaga el error original —
 * perder el retry automático es un efecto colateral aceptable frente a
 * enmascarar la causa real.
 *
 * `asignacionesPrefetched` se propaga al comando puro para que el resync
 * masivo (admin) pueda leer la hoja una sola vez y reutilizar el resultado.
 */
export async function intentarSincronizarGrupos(
  githubUsername: string,
  comision: Comision,
  asignacionesPrefetched?: AsignacionGrupoRow[]
): Promise<void> {
  try {
    await sincronizarGruposDelAlumno(githubUsername, comision, asignacionesPrefetched);
  } catch (error) {
    logger.error(
      {
        err: error,
        githubUsername,
        comisionId: comision.id,
      },
      "Falló sincronización de grupos desde planilla"
    );
    try {
      await marcarGruposSyncFallido(githubUsername);
    } catch (flagError) {
      logger.error(
        {
          err: flagError,
          githubUsername,
          comisionId: comision.id,
        },
        "Falló al persistir el flag gruposSyncFallidoEn (retry automático no disparará)"
      );
    }
    throw error;
  }

  await marcarGruposSyncOk(githubUsername);
}
