import type { Comision } from "@/domain/entities";
import { upsertAlumnos } from "@/infrastructure/repositories";
import { getAlumnos } from "@/infrastructure/sheets";

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

  // Las integraciones externas se procesan desde acciones administrativas
  // reintentables y acotadas. Una importación grande no debe agotar el
  // timeout de la request por suscribir alumnos uno por uno.
  return { sincronizados, conErrorDeGrupo: 0 };
}
