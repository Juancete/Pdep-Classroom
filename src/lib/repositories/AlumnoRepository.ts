import { getEM } from "@/lib/db";
import { Alumno } from "@/domain/entities";
import type { Comision } from "@/domain/entities";

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
  const em = await getEM();
  const otro = await em.findOne(Alumno, { legajo: legajo.trim() });
  if (otro && otro.githubUsername.toLowerCase() !== githubUsername.toLowerCase().trim()) {
    throw new LegajoConflictError(legajo.trim(), otro.githubUsername);
  }
}

export async function getAlumnos(): Promise<Alumno[]> {
  const em = await getEM();
  return em.find(Alumno, {}, { orderBy: { apellido: "ASC", nombre: "ASC" } });
}

export async function getAlumnoByGithub(
  githubUsername: string
): Promise<Alumno | null> {
  const em = await getEM();
  return em.findOne(Alumno, {
    githubUsername: githubUsername.toLowerCase(),
  });
}

export async function getAlumnoByLegajo(
  legajo: string
): Promise<Alumno | null> {
  const em = await getEM();
  return em.findOne(Alumno, { legajo: legajo.trim() });
}

export interface AlumnoData {
  legajo: string;
  nombre: string;
  apellido: string;
  githubUsername: string;
  email: string;
  comision?: Comision;
  registroConfirmadoEn?: Comision;
}

export async function createAlumno(data: AlumnoData): Promise<Alumno> {
  await assertLegajoLibreOPropio(data.legajo, data.githubUsername);
  const em = await getEM();
  const alumno = new Alumno();
  alumno.legajo = data.legajo.trim();
  alumno.nombre = data.nombre.trim();
  alumno.apellido = data.apellido.trim();
  alumno.githubUsername = data.githubUsername.toLowerCase().trim();
  alumno.email = data.email.toLowerCase().trim();
  alumno.comision = data.comision;
  alumno.registroConfirmadoEn = data.registroConfirmadoEn;
  em.persist(alumno);
  await em.flush();
  return alumno;
}

/** Crea o actualiza el Alumno en la DB a partir de los datos de la planilla. */
export async function upsertAlumno(data: AlumnoData): Promise<Alumno> {
  await assertLegajoLibreOPropio(data.legajo, data.githubUsername);
  const em = await getEM();
  const existing = await em.findOne(Alumno, {
    githubUsername: data.githubUsername.toLowerCase().trim(),
  });

  if (existing) {
    existing.legajo = data.legajo.trim();
    existing.nombre = data.nombre.trim();
    existing.apellido = data.apellido.trim();
    existing.email = data.email.toLowerCase().trim();
    existing.comision = data.comision;
    if (data.registroConfirmadoEn !== undefined) {
      existing.registroConfirmadoEn = data.registroConfirmadoEn;
    }
    await em.flush();
    return existing;
  }

  return createAlumno(data);
}

/** Crea o actualiza múltiples alumnos en un solo flush. */
export async function upsertAlumnos(dataList: AlumnoData[]): Promise<number> {
  if (dataList.length === 0) return 0;

  const em = await getEM();

  // Validar coherencia legajo↔github antes de persistir: el UNIQUE de la DB
  // dispararía un error genérico del driver. Así surfaceamos LegajoConflictError
  // con los datos específicos, igual que upsertAlumno.
  const githubPorLegajo = new Map<string, string>();
  for (const data of dataList) {
    const legajo = data.legajo.trim();
    const github = data.githubUsername.toLowerCase().trim();
    const prev = githubPorLegajo.get(legajo);
    if (prev && prev !== github) {
      throw new LegajoConflictError(legajo, prev);
    }
    githubPorLegajo.set(legajo, github);
  }
  const legajos = [...githubPorLegajo.keys()];
  const alumnosConLegajoTomado = await em.find(Alumno, { legajo: { $in: legajos } });
  for (const alumno of alumnosConLegajoTomado) {
    const incomingGithub = githubPorLegajo.get(alumno.legajo)!;
    if (alumno.githubUsername.toLowerCase() !== incomingGithub) {
      throw new LegajoConflictError(alumno.legajo, alumno.githubUsername);
    }
  }

  const githubUsernames = [...githubPorLegajo.values()];
  const existentes = await em.find(Alumno, { githubUsername: { $in: githubUsernames } });
  const existentesPorGithub = new Map(existentes.map((a) => [a.githubUsername, a]));

  for (const data of dataList) {
    const key = data.githubUsername.toLowerCase().trim();
    const existing = existentesPorGithub.get(key);
    if (existing) {
      existing.legajo = data.legajo.trim();
      existing.nombre = data.nombre.trim();
      existing.apellido = data.apellido.trim();
      existing.email = data.email.toLowerCase().trim();
      existing.comision = data.comision;
    } else {
      const alumno = new Alumno();
      alumno.legajo = data.legajo.trim();
      alumno.nombre = data.nombre.trim();
      alumno.apellido = data.apellido.trim();
      alumno.githubUsername = key;
      alumno.email = data.email.toLowerCase().trim();
      alumno.comision = data.comision;
      em.persist(alumno);
      // Si el batch trae otra fila con el mismo github (typo o fila duplicada
      // en la planilla), debe reutilizar esta instancia — sin esto, el UNIQUE
      // de githubUsername explota en el flush con un error genérico.
      existentesPorGithub.set(key, alumno);
    }
  }

  await em.flush();
  return dataList.length;
}

export async function countAlumnos(): Promise<number> {
  const em = await getEM();
  return em.count(Alumno, {});
}
