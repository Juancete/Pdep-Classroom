import { getEM } from "@/lib/db";
import {
  Grupo,
  Alumno,
  GrupalAssignment,
  Assignment,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  AssignmentNoGrupalError,
} from "@/domain/entities";
import type { Paradigma } from "@/types";

export async function getGruposDeAlumno(
  githubUsername: string
): Promise<Map<string, Grupo>> {
  const em = await getEM();
  const grupos = await em.find(
    Grupo,
    { alumnos: { githubUsername: { $ilike: githubUsername } } },
    { populate: ["assignment", "alumnos"] }
  );
  return new Map(grupos.map((grupo) => [grupo.assignment.id, grupo]));
}

export async function getGrupos(paradigma?: Paradigma): Promise<Grupo[]> {
  const em = await getEM();
  const where = paradigma ? { paradigma } : {};
  return em.find(Grupo, where, { populate: ["assignment", "alumnos"] });
}

export async function getGruposDeAssignment(assignmentId: string): Promise<Grupo[]> {
  const em = await getEM();
  return em.find(
    Grupo,
    { assignment: { id: assignmentId } },
    { populate: ["alumnos"] }
  );
}

export async function getGrupoDeAlumnoEnAssignment(
  assignmentId: string,
  githubUsername: string
): Promise<Grupo | null> {
  const em = await getEM();
  return em.findOne(
    Grupo,
    {
      assignment: { id: assignmentId },
      alumnos: { githubUsername: { $ilike: githubUsername } },
    },
    { populate: ["alumnos"] }
  );
}

// Crea un grupo nuevo en un assignment grupal y suma al alumno creador como
// primer miembro. Atómico: la lectura del assignment, la verificación de que
// el alumno no esté ya en otro grupo, y la creación se hacen en una única
// transacción para evitar carreras (dos creaciones simultáneas, o crear
// mientras un join concurrente está en curso).
export async function crearGrupo(params: {
  assignmentId: string;
  alumnoId: string;
  nombre: string;
}): Promise<Grupo> {
  const { assignmentId, alumnoId, nombre } = params;
  const em = await getEM();

  return em.transactional(async (tx) => {
    const assignment = await tx.findOne(Assignment, { id: assignmentId });
    if (!assignment || !(assignment instanceof GrupalAssignment)) {
      throw new AssignmentNoGrupalError(assignmentId);
    }
    if (!assignment.aceptaNuevasInscripciones()) {
      throw new InscripcionesCerradasError(assignmentId);
    }

    const alumno = await tx.findOneOrFail(Alumno, { id: alumnoId });

    const yaEnGrupo = await tx.findOne(Grupo, {
      assignment: { id: assignmentId },
      alumnos: { id: alumno.id },
    });
    if (yaEnGrupo) {
      throw new AlumnoYaEnGrupoDelAssignmentError(assignmentId, alumno.githubUsername);
    }

    const grupo = new Grupo();
    grupo.nombre = nombre;
    grupo.paradigma = assignment.paradigma;
    grupo.assignment = assignment;
    grupo.maxIntegrantes = assignment.maxIntegrantes;
    grupo.creadoPor = alumno.githubUsername;
    grupo.alumnos.add(alumno);
    tx.persist(grupo);

    await tx.flush();
    return grupo;
  });
}

// Suma al alumno como miembro de un grupo existente. Atómico: re-checa cupo
// y "no está en otro grupo del mismo assignment" dentro de la transacción
// para resolver el race del último cupo (dos joins simultáneos al mismo
// grupo cuando queda un solo lugar).
export async function unirseAGrupo(params: {
  grupoId: string;
  alumnoId: string;
}): Promise<Grupo> {
  const { grupoId, alumnoId } = params;
  const em = await getEM();

  return em.transactional(async (tx) => {
    const grupo = await tx.findOneOrFail(
      Grupo,
      { id: grupoId },
      { populate: ["alumnos", "assignment"] }
    );
    const assignment = grupo.assignment;
    if (!assignment.aceptaNuevasInscripciones()) {
      throw new InscripcionesCerradasError(assignment.id);
    }

    const alumno = await tx.findOneOrFail(Alumno, { id: alumnoId });

    if (grupo.alumnos.contains(alumno)) {
      return grupo;
    }

    const enOtroGrupo = await tx.findOne(Grupo, {
      assignment: { id: assignment.id },
      alumnos: { id: alumno.id },
    });
    if (enOtroGrupo) {
      throw new AlumnoYaEnGrupoDelAssignmentError(
        assignment.id,
        alumno.githubUsername
      );
    }

    grupo.addMember(alumno);

    await tx.flush();
    return grupo;
  });
}

// Usado por la sincronización desde la planilla: crea el Grupo (nombre +
// paradigma + assignment) si no existe, y agrega al alumno como miembro
// si no lo era. Idempotente.
export async function upsertGrupoConMiembro(params: {
  nombreGrupo: string;
  paradigma: Paradigma;
  assignment: GrupalAssignment;
  alumno: Alumno;
}): Promise<Grupo> {
  const { nombreGrupo, paradigma, assignment, alumno } = params;
  const em = await getEM();

  const existente = await em.findOne(
    Grupo,
    {
      nombre: nombreGrupo,
      paradigma,
      assignment: { id: assignment.id },
    },
    { populate: ["alumnos"] }
  );

  let grupo: Grupo;
  if (existente) {
    grupo = existente;
  } else {
    grupo = new Grupo();
    grupo.nombre = nombreGrupo;
    grupo.paradigma = paradigma;
    grupo.assignment = assignment;
    grupo.maxIntegrantes = assignment.maxIntegrantes;
    grupo.creadoPor = "sheets-sync";
    em.persist(grupo);
  }

  if (!grupo.alumnos.contains(alumno)) {
    grupo.alumnos.add(alumno);
  }

  await em.flush();
  return grupo;
}
