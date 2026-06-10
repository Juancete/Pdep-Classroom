import type { Comision } from "@/domain/entities";
import { upsertAlumnos } from "@/lib/repositories";
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
    const fullMessage = message.startsWith("No se pudo leer la planilla")
      ? message
      : `No se pudo leer la planilla: ${message}`;
    super(fullMessage, { cause });
    this.name = "LecturaPlanillaAlumnosError";
  }
}

/**
 * Caso de uso de importación admin: lee alumnos desde Sheets, persiste el bulk
 * upsert y dispara los hooks accesorios de importación.
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

  const sincronizados = await upsertAlumnos(
    alumnos.map((alumno) => ({ ...alumno, comision }))
  );

  let conErrorDeGrupo = 0;
  for (const alumno of alumnos) {
    const { groupSubscription } = await ejecutarHooksPostConfirmacion(
      {
        githubUsername: alumno.githubUsername,
        email: alumno.email,
        comision,
      },
      HOOKS_IMPORTACION_ALUMNO
    );
    if (groupSubscription === "error") conErrorDeGrupo++;
  }

  return { sincronizados, conErrorDeGrupo };
}
