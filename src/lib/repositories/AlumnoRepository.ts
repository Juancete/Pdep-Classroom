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
    await em.flush();
    return existing;
  }

  return createAlumno(data);
}

export async function countAlumnos(): Promise<number> {
  const em = await getEM();
  return em.count(Alumno, {});
}
