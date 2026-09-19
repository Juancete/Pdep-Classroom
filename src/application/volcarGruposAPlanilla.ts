import { AssignmentNoEncontradoError } from "@/domain/entities";
import {
  getAssignment,
  getAlumnosByComision,
  getGruposDeAssignment,
} from "@/infrastructure/repositories";
import { escribirColumnaDeGrupoEnSheets, type ResultadoDeVolcado } from "@/infrastructure/sheets";

// Issue #109: volcado manual DB → planilla del grupo de cada alumno,
// disparado por el admin desde el detalle del assignment grupal — camino
// inverso al bootstrap Sheets → DB (`grupoSync.ts`), que sólo corre al
// inicio de la cursada. Errores de dominio propios, en el estilo de
// `LecturaPlanillaAlumnosError` (`importarAlumnosDeComision.ts`):
// específicos de este flujo, no reutilizables por otro caller.

export class ColumnaDeGrupoNoConfiguradaError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Este TP no tiene una columna de la planilla configurada para volcar los grupos.");
    this.name = "ColumnaDeGrupoNoConfiguradaError";
  }
}

export class AssignmentSinComisionError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Este TP no tiene una comisión asociada; no hay planilla a la cual volcar los grupos.");
    this.name = "AssignmentSinComisionError";
  }
}

// Issue #109: la columna se valida contra datos personales al configurarla
// en el form del TP, pero `comision.columnConfig` puede cambiar después —
// esta segunda validación, justo antes de escribir, evita pisar un dato
// personal si la columna quedó reasignada mientras tanto.
export class ColumnaDeGrupoOcupadaPorDatosPersonalesError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly columna: number
  ) {
    super(
      "La columna configurada para volcar los grupos ahora está ocupada por un dato personal del alumno en la planilla de la comisión. Elegí otra columna en el TP."
    );
    this.name = "ColumnaDeGrupoOcupadaPorDatosPersonalesError";
  }
}

/**
 * Vuelca a la planilla de alumnos de la comisión el nombre del grupo de
 * cada alumno, en la columna configurada en el assignment grupal. Espejo
 * idempotente: un alumno sin grupo (o que salió de uno) queda con la celda
 * vacía — dos corridas seguidas sin cambios de grupos no modifican nada.
 *
 * Excluye los grupos de docentes (demo de Mis TPs, issue #107/#112): sólo
 * interesan los grupos de alumnos, que son los que tienen fila en la hoja.
 * Se pasan los usernames de TODOS los alumnos de la comisión (no sólo los
 * que tienen grupo) para que quien perdió su grupo también quede vacío.
 */
export async function volcarGruposAPlanilla(
  assignmentId: string
): Promise<ResultadoDeVolcado> {
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw new AssignmentNoEncontradoError(assignmentId);

  const grupal = assignment.exigirGrupal();
  if (!grupal.puedeVolcarseAPlanilla()) {
    throw new ColumnaDeGrupoNoConfiguradaError(assignmentId);
  }
  // `puedeVolcarseAPlanilla()` ya garantizó que es un número — TS no puede
  // enlazar la afirmación de una llamada con la lectura de la otra.
  const columna = grupal.columnaGrupoEnPlanilla as number;

  const comision = assignment.comision;
  if (!comision) throw new AssignmentSinComisionError(assignmentId);
  if (comision.columnaOcupadaPorDatosPersonales(columna)) {
    throw new ColumnaDeGrupoOcupadaPorDatosPersonalesError(assignmentId, columna);
  }

  const [alumnos, grupos] = await Promise.all([
    getAlumnosByComision(comision.id),
    getGruposDeAssignment(assignmentId),
  ]);

  const nombreGrupoPorUsername = new Map<string, string>();
  for (const grupo of grupos) {
    if (!grupo.admiteIntegrantesDe("alumnos")) continue;
    for (const username of grupo.usernamesDeMiembros()) {
      nombreGrupoPorUsername.set(username, grupo.nombre);
    }
  }

  const usernames = alumnos.map((alumno) => alumno.githubUsername);

  return escribirColumnaDeGrupoEnSheets(
    comision.spreadsheetId,
    comision.columnConfig,
    columna,
    nombreGrupoPorUsername,
    usernames
  );
}
