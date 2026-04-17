import { getEM } from "@/lib/db";
import { Alumno } from "@/domain/entities";
import type { Comision } from "@/domain/entities";

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
  const githubUsernames = dataList.map((d) => d.githubUsername.toLowerCase().trim());
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
    }
  }

  await em.flush();
  return dataList.length;
}

export async function countAlumnos(): Promise<number> {
  const em = await getEM();
  return em.count(Alumno, {});
}
