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
import {
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
  autorizarAccesoAssignment,
} from "@/lib/services/assignmentAuthorization";

export async function getGruposDeAlumno(
  githubUsername: string
): Promise<Map<string, Grupo>> {
  const entityManager = await getEM();
  const grupos = await entityManager.find(
    Grupo,
    { alumnos: { githubUsername: { $ilike: githubUsername } } },
    { populate: ["assignment", "alumnos"] }
  );
  return new Map(grupos.map((grupo) => [grupo.assignment.id, grupo]));
}

export async function getGrupos(paradigma?: Paradigma): Promise<Grupo[]> {
  const entityManager = await getEM();
  const where = paradigma ? { paradigma } : {};
  return entityManager.find(Grupo, where, { populate: ["assignment", "alumnos"] });
}

export async function getGruposDeAssignment(assignmentId: string): Promise<Grupo[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Grupo,
    { assignment: { id: assignmentId } },
    { populate: ["alumnos"] }
  );
}

export async function getGrupoDeAlumnoEnAssignment(
  assignmentId: string,
  githubUsername: string
): Promise<Grupo | null> {
  const entityManager = await getEM();
  return entityManager.findOne(
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
  esAdmin: boolean;
}): Promise<Grupo> {
  const { assignmentId, alumnoId, nombre, esAdmin } = params;
  const entityManager = await getEM();

  return entityManager.transactional(async (transaction) => {
    const assignment = await transaction.findOne(
      Assignment,
      { id: assignmentId },
      { populate: ["comision"] }
    );
    if (!assignment) {
      throw new AssignmentNoEncontradoError(assignmentId);
    }
    if (!(assignment instanceof GrupalAssignment)) {
      throw new AssignmentNoGrupalError(assignmentId);
    }

    const alumno = await transaction.findOneOrFail(
      Alumno,
      { id: alumnoId },
      { populate: ["comision"] }
    );
    autorizarAccesoAssignment({ isAdmin: esAdmin }, alumno, assignment);

    if (!assignment.aceptaNuevasInscripciones()) {
      throw new InscripcionesCerradasError(assignmentId);
    }

    const yaEnGrupo = await transaction.findOne(Grupo, {
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
    transaction.persist(grupo);

    await transaction.flush();
    return grupo;
  });
}

// Suma al alumno como miembro de un grupo existente. Atómico: re-checa cupo
// y "no está en otro grupo del mismo assignment" dentro de la transacción
// para resolver el race del último cupo (dos joins simultáneos al mismo
// grupo cuando queda un solo lugar).
export async function unirseAGrupo(params: {
  assignmentId: string;
  grupoId: string;
  alumnoId: string;
  esAdmin: boolean;
}): Promise<Grupo> {
  const { assignmentId, grupoId, alumnoId, esAdmin } = params;
  const entityManager = await getEM();

  return entityManager.transactional(async (transaction) => {
    const grupo = await transaction.findOne(
      Grupo,
      { id: grupoId, assignment: { id: assignmentId } },
      { populate: ["alumnos", "assignment.comision"] }
    );
    if (!grupo) throw new GrupoNoEncontradoError(assignmentId, grupoId);

    const assignment = grupo.assignment;
    const alumno = await transaction.findOneOrFail(
      Alumno,
      { id: alumnoId },
      { populate: ["comision"] }
    );
    autorizarAccesoAssignment({ isAdmin: esAdmin }, alumno, assignment);

    if (grupo.alumnos.contains(alumno)) {
      return grupo;
    }

    if (!assignment.aceptaNuevasInscripciones()) {
      throw new InscripcionesCerradasError(assignment.id);
    }

    const enOtroGrupo = await transaction.findOne(Grupo, {
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

    await transaction.flush();
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
  const entityManager = await getEM();

  const existente = await entityManager.findOne(
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
    entityManager.persist(grupo);
  }

  if (!grupo.alumnos.contains(alumno)) {
    grupo.alumnos.add(alumno);
  }

  await entityManager.flush();
  return grupo;
}
