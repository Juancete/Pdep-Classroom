import { getEM } from "@/lib/db";
import { Alumno } from "@/domain/entities";

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

export async function createAlumno(data: {
  legajo: string;
  nombre: string;
  apellido: string;
  githubUsername: string;
  email: string;
  comision?: string;
}): Promise<Alumno> {
  const em = await getEM();
  const alumno = new Alumno();
  alumno.legajo = data.legajo.trim();
  alumno.nombre = data.nombre.trim();
  alumno.apellido = data.apellido.trim();
  alumno.githubUsername = data.githubUsername.toLowerCase().trim();
  alumno.email = data.email.toLowerCase().trim();
  alumno.comision = data.comision?.trim();
  em.persist(alumno);
  await em.flush();
  return alumno;
}
