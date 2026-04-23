import { getEM } from "@/lib/db";
import { logger } from "@/lib/logger";
import { Alumno, GrupalAssignment, type Comision } from "@/domain/entities";
import { getAsignacionesGrupos } from "@/lib/sheets";
import { upsertGrupoConMiembro } from "@/lib/repositories";

/**
 * Mira la hoja de grupos configurada en la comisión; si el alumno aparece,
 * materializa en DB los grupos que le corresponden, uno por cada GrupalAssignment
 * del mismo paradigma que ya exista en la comisión.
 *
 * Es idempotente y best-effort: si no hay `columnConfig.grupos`, no hace nada;
 * si la lectura de Sheets falla, lo logueamos y devolvemos sin romper (el caller
 * —el registro— ya confirmó al alumno antes de llamarnos).
 *
 * Limitación consciente: si todavía no existe el `GrupalAssignment` del paradigma,
 * el grupo no se materializa. Se resuelve la próxima vez que el alumno reingrese
 * al perfil, o por un comando de sincronización masiva (fuera de alcance acá).
 */
export async function sincronizarGruposDelAlumno(
  githubUsername: string,
  comision: Comision
): Promise<void> {
  const gruposConfig = comision.columnConfig?.grupos;
  if (!gruposConfig) return;

  const ghNorm = githubUsername.toLowerCase().trim();

  let asignaciones;
  try {
    asignaciones = await getAsignacionesGrupos(comision.spreadsheetId, gruposConfig);
  } catch (error) {
    logger.error(
      { err: error, githubUsername: ghNorm, comisionId: comision.id },
      "No se pudo leer la hoja de grupos — skip sincronización"
    );
    return;
  }

  const deEsteAlumno = asignaciones.filter((a) => a.githubUsername === ghNorm);
  if (deEsteAlumno.length === 0) return;

  const em = await getEM();
  const alumno = await em.findOne(Alumno, { githubUsername: ghNorm });
  if (!alumno) return;

  for (const asig of deEsteAlumno) {
    const grupales = await em.find(GrupalAssignment, {
      comision: { id: comision.id },
      paradigma: asig.paradigma,
    });
    for (const assignment of grupales) {
      try {
        await upsertGrupoConMiembro({
          nombreGrupo: asig.nombreGrupo,
          paradigma: asig.paradigma,
          assignment,
          alumno,
        });
      } catch (error) {
        logger.error(
          {
            err: error,
            githubUsername: ghNorm,
            assignmentId: assignment.id,
            nombreGrupo: asig.nombreGrupo,
            paradigma: asig.paradigma,
          },
          "No se pudo upsertar grupo desde planilla"
        );
      }
    }
  }
}
