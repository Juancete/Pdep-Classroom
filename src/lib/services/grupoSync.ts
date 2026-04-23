import { getEM } from "@/lib/db";
import { Alumno, GrupalAssignment, type Comision } from "@/domain/entities";
import { getAsignacionesGrupos } from "@/lib/sheets";
import { upsertGrupoConMiembro } from "@/lib/repositories";

/**
 * Mira la hoja de grupos configurada en la comisión; si el alumno aparece,
 * materializa en DB los grupos que le corresponden, uno por cada GrupalAssignment
 * del mismo paradigma que ya exista en la comisión.
 *
 * Es idempotente. Comando puro: o cumple, o throwea — la decisión de qué mostrar
 * al usuario ante una falla vive en el handler HTTP que orquesta el registro.
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

  const asignaciones = await getAsignacionesGrupos(comision.spreadsheetId, gruposConfig);

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
      await upsertGrupoConMiembro({
        nombreGrupo: asig.nombreGrupo,
        paradigma: asig.paradigma,
        assignment,
        alumno,
      });
    }
  }
}
