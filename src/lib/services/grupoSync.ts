import { getEM } from "@/lib/db";
import { Alumno, GrupalAssignment, type Comision } from "@/domain/entities";
import { getAsignacionesGrupos, type AsignacionGrupoRow } from "@/lib/sheets";
import { upsertGrupoConMiembro } from "@/lib/repositories";

/**
 * Mira la hoja de grupos configurada en la comisión; si el alumno aparece,
 * materializa en DB los grupos que le corresponden, uno por cada GrupalAssignment
 * del mismo paradigma que ya exista en la comisión.
 *
 * Es idempotente. Comando puro: o cumple, o throwea — la decisión de qué mostrar
 * al usuario ante una falla vive en el handler HTTP que orquesta el registro.
 *
 * Si todavía no existe el `GrupalAssignment` del paradigma, el grupo no se
 * materializa. Antes de marcar el bootstrap como completado, el docente debe
 * crear los assignments grupales que quiera importar.
 *
 * Esta función es aditiva a propósito y sólo se usa durante el bootstrap. Al
 * completar la importación, `Comision.gruposImportadosEn` impide volver a
 * ejecutarla y Classroom pasa a ser la única fuente de verdad, por lo que una
 * baja o cambio manual no se revierte desde Sheets.
 *
 * `asignacionesPrefetched` permite al caller reutilizar una lectura previa de la
 * hoja cuando sincroniza a varios alumnos seguidos (resync masivo), evitando
 * N lecturas a Sheets. Si se omite, la función lee la hoja por sí misma.
 */
export async function sincronizarGruposDelAlumno(
  githubUsername: string,
  comision: Comision,
  asignacionesPrefetched?: AsignacionGrupoRow[]
): Promise<void> {
  const gruposConfig = comision.gruposConfig();
  if (!gruposConfig) return;

  const ghNorm = Alumno.normalizarUsername(githubUsername);

  const asignaciones =
    asignacionesPrefetched ??
    (await getAsignacionesGrupos(comision.spreadsheetId, gruposConfig));

  const deEsteAlumno = asignaciones.filter((asignacion) => asignacion.githubUsername === ghNorm);
  if (deEsteAlumno.length === 0) return;

  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, { githubUsername: ghNorm });
  if (!alumno) return;

  for (const asig of deEsteAlumno) {
    const grupales = await entityManager.find(GrupalAssignment, {
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
