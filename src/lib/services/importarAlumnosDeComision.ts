import { Alumno, type Comision } from "@/domain/entities";
import {
  getAlumnosByGithubUsernames,
  upsertAlumnos,
} from "@/lib/repositories";
import { getAlumnos } from "@/lib/sheets";
import {
  ejecutarHooksPostConfirmacion,
  HOOKS_IMPORTACION_ALUMNO,
} from "./hooksPostConfirmacion";

export type ResultadoImportacionAlumnos = {
  sincronizados: number;
  conErrorDeGrupo: number;
};

export class LecturaPlanillaAlumnosError extends Error {
  constructor(cause: unknown) {
    const message = cause instanceof Error ? cause.message : "Error desconocido";
    super(`No se pudo leer la planilla: ${message}`, { cause });
    this.name = "LecturaPlanillaAlumnosError";
  }
}

/**
 * Caso de uso de importación admin: lee alumnos desde Sheets, persiste el bulk
 * upsert y dispara los hooks accesorios de importación. Captura emails previos
 * antes del flush para que Google Groups pueda des-suscribir direcciones viejas.
 */
export async function importarAlumnosDeComision(
  comision: Comision
): Promise<ResultadoImportacionAlumnos> {
  let alumnos;
  try {
    alumnos = await getAlumnos(comision.spreadsheetId, comision.columnConfig);
  } catch (error) {
    throw new LecturaPlanillaAlumnosError(error);
  }

  const existentes = await getAlumnosByGithubUsernames(
    alumnos.map((alumno) => alumno.githubUsername)
  );
  const emailPrevioPorGithub = new Map(
    existentes.map((alumno) => [alumno.usernameCanonico, alumno.email])
  );

  const sincronizados = await upsertAlumnos(
    alumnos.map((alumno) => ({ ...alumno, comision }))
  );

  let conErrorDeGrupo = 0;
  for (const alumno of alumnos) {
    const githubUsername = Alumno.normalizarUsername(alumno.githubUsername);
    const { groupSubscription } = await ejecutarHooksPostConfirmacion(
      {
        githubUsername: alumno.githubUsername,
        email: alumno.email,
        comision,
        emailPrevio: emailPrevioPorGithub.get(githubUsername),
      },
      HOOKS_IMPORTACION_ALUMNO
    );
    if (groupSubscription === "error") conErrorDeGrupo++;
  }

  return { sincronizados, conErrorDeGrupo };
}
