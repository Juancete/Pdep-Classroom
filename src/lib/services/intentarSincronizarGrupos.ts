import { logger } from "@/lib/logger";
import type { Comision } from "@/domain/entities";
import { marcarGruposSyncFallido, marcarGruposSyncOk } from "@/lib/repositories";
import { sincronizarGruposDelAlumno } from "./grupoSync";

/**
 * Envuelve al comando puro `sincronizarGruposDelAlumno` con la lógica de
 * estado que comparten todos los callers: loguear el error, prender o
 * limpiar el flag `gruposSyncFallidoEn` según corresponda, y reportar al
 * caller si quedó en error para que propague el warning al usuario.
 *
 * Los handlers HTTP (registro, perfil) y la page `/perfil` al montar usan
 * este wrapper — no `sincronizarGruposDelAlumno` directo — para que el
 * estado persistente quede consistente en cada intento.
 *
 * @returns `true` si la sincronización falló (flag prendido), `false` si fue OK.
 */
export async function intentarSincronizarGrupos(
  githubUsername: string,
  comision: Comision
): Promise<boolean> {
  try {
    await sincronizarGruposDelAlumno(githubUsername, comision);
    await marcarGruposSyncOk(githubUsername);
    return false;
  } catch (error) {
    logger.error(
      {
        err: error,
        githubUsername,
        comisionId: comision.id,
      },
      "Falló sincronización de grupos desde planilla"
    );
    await marcarGruposSyncFallido(githubUsername);
    return true;
  }
}
