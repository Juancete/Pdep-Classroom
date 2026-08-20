import { getEM } from "@/lib/db";
import type { EntityManager } from "@mikro-orm/postgresql";
import {
  Alumno,
  type AlumnoData,
  type EstadoGoogleGroup,
} from "@/domain/entities";
import type { Comision } from "@/domain/entities";

export type { AlumnoData } from "@/domain/entities";

// El legajo es la PK del alumno en la cursada: dos alumnos no pueden compartirlo.
// La UNIQUE constraint de la DB ya lo garantiza, pero lanzamos este error antes
// del flush para poder devolverle al cliente un mensaje claro y el `field`
// afectado en vez de un crash genérico del driver.
export class LegajoConflictError extends Error {
  constructor(
    public readonly legajo: string,
    public readonly otroGithubUsername: string
  ) {
    super(
      `El legajo ${legajo} ya está registrado con el usuario @${otroGithubUsername}. Verificá que sea el tuyo.`
    );
    this.name = "LegajoConflictError";
  }
}

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
    existing.actualizarDatos(data);
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

export async function getAlumnosConGoogleGroupPendiente(
  comisionId: string,
  incluirOmitidos = false
): Promise<Alumno[]> {
  const entityManager = await getEM();
  const estados: EstadoGoogleGroup[] = incluirOmitidos
    ? ["pendiente", "fallido", "omitido"]
    : ["pendiente", "fallido"];
  return entityManager.find(
    Alumno,
    {
      comision: { id: comisionId },
      googleGroupEstado: { $in: estados },
    },
    { orderBy: { apellido: "ASC", nombre: "ASC" } }
  );
}

export async function actualizarEstadoGoogleGroup(
  githubUsername: string,
  actualizar: (alumno: Alumno) => void
): Promise<Alumno | null> {
  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(githubUsername),
  });
  if (!alumno) return null;
  actualizar(alumno);
  await entityManager.flush();
  return alumno;
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

  for (const data of dataList) {
    const key = Alumno.normalizarUsername(data.githubUsername);
    const existing = existentesPorGithub.get(key);
    if (existing) {
      existing.actualizarDatos(data);
    } else {
      const alumno = new Alumno();
      alumno.actualizarDatos(data);
      entityManager.persist(alumno);
      // Si el batch trae otra fila con el mismo github (typo o fila duplicada
      // en la planilla), debe reutilizar esta instancia — sin esto, el UNIQUE
      // de githubUsername explota en el flush con un error genérico.
      existentesPorGithub.set(key, alumno);
    }
  }

  await entityManager.flush();
  return dataList.length;
}

export async function countAlumnos(): Promise<number> {
  const entityManager = await getEM();
  return entityManager.count(Alumno, {});
}
