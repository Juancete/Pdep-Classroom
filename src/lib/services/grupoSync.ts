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
 * Limitación consciente: si todavía no existe el `GrupalAssignment` del paradigma,
 * el grupo no se materializa. Se resuelve la próxima vez que el alumno reingrese
 * al perfil, o por un comando de sincronización masiva (fuera de alcance acá).
 *
 * Otra limitación consciente, relevante desde la issue #50 (salir/cambiarse de
 * grupo): esta función es puramente aditiva — sólo agrega al alumno a los grupos
 * que la planilla indica, nunca lo saca de ninguno. Si un alumno sale de un grupo
 * a mano (self-service o vía el panel del docente) pero la planilla lo sigue
 * listando en ese grupo, el próximo resync (reingreso al perfil, o resync masivo
 * desde `/admin/comisiones`) lo vuelve a insertar ahí — pisando la decisión
 * manual sin avisar. No se resuelve acá: reconciliar la fuente de verdad entre
 * la decisión manual y la planilla es el alcance de la issue #28 (reconciliar
 * grupos importados desde Sheets en vez de sólo acumular miembros).
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
