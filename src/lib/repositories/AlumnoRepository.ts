import { getEM } from "@/lib/db";
import type { EntityManager } from "@mikro-orm/postgresql";
import { Alumno, LegajoConflictError, type AlumnoData } from "@/domain/entities";
import type { Comision } from "@/domain/entities";
import {
  crearSuscripcionesFaltantes,
  marcarSuscripcionesPendientes,
} from "./SuscripcionAlumnoRepository";

export type { AlumnoData } from "@/domain/entities";
// `LegajoConflictError` es un error de dominio (vive en `Alumno.ts` — Fase 4
// de la auditoría de dominio): se reexporta acá para no romper a los
// callers que ya lo importan desde este repositorio.
export { LegajoConflictError } from "@/domain/entities";

async function assertLegajoLibreOPropio(
  legajo: string,
  githubUsername: string
): Promise<void> {
  const entityManager = await getEM();
  const otro = await entityManager.findOne(Alumno, { legajo: legajo.trim() });
  if (otro && otro.usernameCanonico !== Alumno.normalizarUsername(githubUsername)) {
    throw new LegajoConflictError(legajo.trim(), otro.githubUsername);
  }
}

export async function getAlumnos(): Promise<Alumno[]> {
  const entityManager = await getEM();
  return entityManager.find(Alumno, {}, { orderBy: { apellido: "ASC", nombre: "ASC" } });
}

export async function getAlumnoByGithub(
  githubUsername: string,
  populateComision = false,
  em?: EntityManager
): Promise<Alumno | null> {
  const entityManager = em ?? (await getEM());
  return entityManager.findOne(
    Alumno,
    { githubUsername: Alumno.normalizarUsername(githubUsername) },
    populateComision ? { populate: ["comision"] } : undefined
  );
}

export async function getAlumnosByGithubUsernames(
  githubUsernames: string[]
): Promise<Alumno[]> {
  const usernamesCanonicos = [
    ...new Set(githubUsernames.map((username) => Alumno.normalizarUsername(username))),
  ];
  if (usernamesCanonicos.length === 0) return [];

  const entityManager = await getEM();
  return entityManager.find(Alumno, {
    githubUsername: { $in: usernamesCanonicos },
  });
}

export async function getAlumnoByLegajo(
  legajo: string
): Promise<Alumno | null> {
  const entityManager = await getEM();
  return entityManager.findOne(Alumno, { legajo: legajo.trim() });
}

export async function createAlumno(data: AlumnoData): Promise<Alumno> {
  await assertLegajoLibreOPropio(data.legajo, data.githubUsername);
  const entityManager = await getEM();
  const alumno = new Alumno();
  alumno.actualizarDatos(data);
  entityManager.persist(alumno);
  await crearSuscripcionesFaltantes([alumno], entityManager);
  await entityManager.flush();
  return alumno;
}

/** Crea o actualiza el Alumno en la DB a partir de los datos de la planilla. */
export async function upsertAlumno(data: AlumnoData): Promise<Alumno> {
  await assertLegajoLibreOPropio(data.legajo, data.githubUsername);
  const entityManager = await getEM();
  const existing = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(data.githubUsername),
  });

  if (existing) {
    const emailAnterior = Alumno.normalizarEmail(existing.email);
    existing.actualizarDatos(data);
    if (emailAnterior !== existing.email) {
      await marcarSuscripcionesPendientes([existing.id], entityManager);
    }
    await entityManager.flush();
    return existing;
  }

  return createAlumno(data);
}

// Marca al alumno como registrado en `comision`. Se usa como segundo paso
// de `confirmarDatosAlumno` — upsertAlumno persiste los datos sin confirmar
// y recién después de que Sheets aceptó la escritura se corre esto, para
// evitar dejar la DB confirmada cuando la planilla quedó desactualizada.
export async function marcarRegistroConfirmado(
  githubUsername: string,
  comision: Comision
): Promise<void> {
  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(githubUsername),
  });
  if (!alumno) return;
  alumno.confirmarRegistroEn(comision);
  await entityManager.flush();
}

export async function marcarGruposSyncFallido(githubUsername: string): Promise<void> {
  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(githubUsername),
  });
  if (!alumno) return;
  alumno.marcarSyncDeGruposFallido();
  await entityManager.flush();
}

export async function marcarGruposSyncOk(githubUsername: string): Promise<void> {
  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(githubUsername),
  });
  // Solo flusheamos si había algo prendido — evita un UPDATE por cada sync
  // exitosa del happy path.
  if (!alumno || !alumno.gruposSyncFallidoEn) return;
  alumno.limpiarSyncDeGruposFallido();
  await entityManager.flush();
}

export async function marcarAlumnoSyncFallido(githubUsername: string): Promise<void> {
  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(githubUsername),
  });
  if (!alumno) return;
  alumno.marcarSyncDeAlumnoFallido();
  await entityManager.flush();
}

export async function marcarAlumnoSyncOk(githubUsername: string): Promise<void> {
  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(githubUsername),
  });
  if (!alumno || !alumno.alumnoSyncFallidoEn) return;
  alumno.limpiarSyncDeAlumnoFallido();
  await entityManager.flush();
}

export async function getAlumnosByComision(
  comisionId: string
): Promise<Alumno[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Alumno,
    { comision: { id: comisionId } },
    { orderBy: { apellido: "ASC", nombre: "ASC" } }
  );
}

export async function getAlumnosConGruposSyncPendiente(
  comisionId: string
): Promise<Alumno[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Alumno,
    { comision: { id: comisionId }, gruposSyncFallidoEn: { $ne: null } },
    { orderBy: { apellido: "ASC", nombre: "ASC" } }
  );
}

/** Crea o actualiza múltiples alumnos en un solo flush. */
export async function upsertAlumnos(dataList: AlumnoData[]): Promise<number> {
  if (dataList.length === 0) return 0;

  const entityManager = await getEM();

  // Validar coherencia legajo↔github antes de persistir: el UNIQUE de la DB
  // dispararía un error genérico del driver. Así surfaceamos LegajoConflictError
  // con los datos específicos, igual que upsertAlumno.
  const githubPorLegajo = new Map<string, string>();
  for (const data of dataList) {
    const legajo = data.legajo.trim();
    const github = Alumno.normalizarUsername(data.githubUsername);
    const prev = githubPorLegajo.get(legajo);
    if (prev && prev !== github) {
      throw new LegajoConflictError(legajo, prev);
    }
    githubPorLegajo.set(legajo, github);
  }
  const legajos = [...githubPorLegajo.keys()];
  const alumnosConLegajoTomado = await entityManager.find(Alumno, { legajo: { $in: legajos } });
  for (const alumno of alumnosConLegajoTomado) {
    const incomingGithub = githubPorLegajo.get(alumno.legajo)!;
    if (alumno.usernameCanonico !== incomingGithub) {
      throw new LegajoConflictError(alumno.legajo, alumno.githubUsername);
    }
  }

  const githubUsernames = [...githubPorLegajo.values()];
  const existentes = await entityManager.find(Alumno, { githubUsername: { $in: githubUsernames } });
  const existentesPorGithub = new Map(existentes.map((alumno) => [alumno.githubUsername, alumno]));

  const alumnosNuevos: Alumno[] = [];
  const idsConEmailCambiado: string[] = [];

  for (const data of dataList) {
    const key = Alumno.normalizarUsername(data.githubUsername);
    const existing = existentesPorGithub.get(key);
    if (existing) {
      const emailAnterior = Alumno.normalizarEmail(existing.email);
      existing.actualizarDatos(data);
      if (emailAnterior !== existing.email) {
        idsConEmailCambiado.push(existing.id);
      }
    } else {
      const alumno = new Alumno();
      alumno.actualizarDatos(data);
      entityManager.persist(alumno);
      alumnosNuevos.push(alumno);
      // Si el batch trae otra fila con el mismo github (typo o fila duplicada
      // en la planilla), debe reutilizar esta instancia — sin esto, el UNIQUE
      // de githubUsername explota en el flush con un error genérico.
      existentesPorGithub.set(key, alumno);
    }
  }

  await crearSuscripcionesFaltantes(alumnosNuevos, entityManager);
  await marcarSuscripcionesPendientes(idsConEmailCambiado, entityManager);

  await entityManager.flush();
  return dataList.length;
}

export async function countAlumnos(comisionId?: string): Promise<number> {
  const entityManager = await getEM();
  return entityManager.count(
    Alumno,
    comisionId ? { comision: { id: comisionId } } : {}
  );
}
