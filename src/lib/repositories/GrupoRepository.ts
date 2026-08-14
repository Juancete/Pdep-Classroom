import { getEM } from "@/lib/db";
import { LockMode } from "@mikro-orm/core";
import {
  Grupo,
  Alumno,
  GrupalAssignment,
  Assignment,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
  AssignmentNoGrupalError,
} from "@/domain/entities";
import type { Paradigma } from "@/types";
import { buildRepoName, slugify } from "@/lib/naming";
import {
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
  autorizarAccionSobreAssignment,
} from "@/lib/services/assignmentAuthorization";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";

const INSCRIPCION_UNICA_CONSTRAINT =
  "grupo_alumnos_assignment_alumno_unique_idx";
const NOMBRE_GRUPO_UNICO_CONSTRAINT =
  "grupo_assignment_nombre_normalizado_unique_idx";

function prepararNombreGrupo(nombre: string): {
  nombre: string;
  nombreNormalizado: string;
} {
  const nombreVisible = nombre.trim();
  const nombreNormalizado = slugify(nombreVisible);
  if (!nombreNormalizado) throw new NombreGrupoInvalidoError(nombre);
  return { nombre: nombreVisible, nombreNormalizado };
}

function esViolacionDeRestriccionUnica(
  error: unknown,
  constraint: string
): boolean {
  if (!(error instanceof Error)) return false;
  const message = `${error.message} ${
    error.cause instanceof Error ? error.cause.message : ""
  }`;
  return (
    extractDbErrorCode(error) === UNIQUE_VIOLATION &&
    message.includes(constraint)
  );
}

function esViolacionDeInscripcionUnica(error: unknown): boolean {
  return esViolacionDeRestriccionUnica(
    error,
    INSCRIPCION_UNICA_CONSTRAINT
  );
}

function esViolacionDeNombreGrupoUnico(error: unknown): boolean {
  return esViolacionDeRestriccionUnica(
    error,
    NOMBRE_GRUPO_UNICO_CONSTRAINT
  );
}

async function traducirConflictoDeInscripcion<T>(
  assignmentId: string,
  githubUsername: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (esViolacionDeInscripcionUnica(error)) {
      throw new AlumnoYaEnGrupoDelAssignmentError(
        assignmentId,
        githubUsername
      );
    }
    throw error;
  }
}

async function traducirConflictoDeNombreGrupo<T>(
  assignmentId: string,
  nombre: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (esViolacionDeNombreGrupoUnico(error)) {
      throw new NombreGrupoDuplicadoError(assignmentId, nombre);
    }
    throw error;
  }
}

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
  const { assignmentId, alumnoId, esAdmin } = params;
  const { nombre, nombreNormalizado } = prepararNombreGrupo(params.nombre);
  const entityManager = await getEM();

  return traducirConflictoDeNombreGrupo(assignmentId, nombre, () =>
    entityManager.transactional(async (transaction) => {
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
      buildRepoName({
        slug: assignment.slug,
        grupoNombreNormalizado: nombreNormalizado,
      });

      const alumno = await transaction.findOneOrFail(
        Alumno,
        { id: alumnoId },
        { populate: ["comision"] }
      );
      autorizarAccionSobreAssignment({ isAdmin: esAdmin }, alumno, assignment);

      return traducirConflictoDeInscripcion(
        assignmentId,
        alumno.githubUsername,
        async () => {
          if (!assignment.aceptaNuevasInscripciones()) {
            throw new InscripcionesCerradasError(assignmentId);
          }

          const yaEnGrupo = await transaction.findOne(Grupo, {
            assignment: { id: assignmentId },
            alumnos: { id: alumno.id },
          });
          if (yaEnGrupo) {
            throw new AlumnoYaEnGrupoDelAssignmentError(
              assignmentId,
              alumno.githubUsername
            );
          }

          const grupo = new Grupo();
          grupo.nombre = nombre;
          grupo.nombreNormalizado = nombreNormalizado;
          grupo.paradigma = assignment.paradigma;
          grupo.assignment = assignment;
          grupo.maxIntegrantes = assignment.maxIntegrantes;
          grupo.creadoPor = alumno.githubUsername;
          grupo.alumnos.add(alumno);
          transaction.persist(grupo);

          await transaction.flush();
          return grupo;
        }
      );
    })
  );
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
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!grupo) throw new GrupoNoEncontradoError(assignmentId, grupoId);

    // El lock se toma antes de leer la colección. Cuando dos requests compiten
    // por el último cupo, el segundo carga los miembros recién confirmados por
    // el primero y vuelve a evaluar el límite con el estado vigente.
    await transaction.populate(
      grupo,
      ["alumnos", "assignment.comision"],
      { refresh: true }
    );

    const assignment = grupo.assignment;
    const alumno = await transaction.findOneOrFail(
      Alumno,
      { id: alumnoId },
      { populate: ["comision"] }
    );
    autorizarAccionSobreAssignment({ isAdmin: esAdmin }, alumno, assignment);

    return traducirConflictoDeInscripcion(
      assignmentId,
      alumno.githubUsername,
      async () => {
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
      }
    );
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
  try {
    return await ejecutarUpsertGrupoConMiembro(params);
  } catch (error) {
    if (!esViolacionDeNombreGrupoUnico(error)) throw error;

    // La otra transacción ya creó el grupo. Un EM nuevo evita reutilizar el
    // estado abortado y permite encontrar al ganador en el segundo intento.
    return traducirConflictoDeNombreGrupo(
      params.assignment.id,
      params.nombreGrupo,
      () => ejecutarUpsertGrupoConMiembro(params)
    );
  }
}

async function ejecutarUpsertGrupoConMiembro(params: {
  nombreGrupo: string;
  paradigma: Paradigma;
  assignment: GrupalAssignment;
  alumno: Alumno;
}): Promise<Grupo> {
  const { paradigma, assignment, alumno } = params;
  const { nombre: nombreGrupo, nombreNormalizado } = prepararNombreGrupo(
    params.nombreGrupo
  );
  buildRepoName({
    slug: assignment.slug,
    grupoNombreNormalizado: nombreNormalizado,
  });
  const entityManager = await getEM();

  return traducirConflictoDeInscripcion(
    assignment.id,
    alumno.githubUsername,
    () =>
      entityManager.transactional(async (transaction) => {
        const existente = await transaction.findOne(
          Grupo,
          {
            nombreNormalizado,
            assignment: { id: assignment.id },
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE }
        );

        let grupo: Grupo;
        if (existente) {
          if (existente.nombre !== nombreGrupo) {
            throw new NombreGrupoDuplicadoError(
              assignment.id,
              nombreGrupo
            );
          }
          grupo = existente;
          await transaction.populate(grupo, ["alumnos"], { refresh: true });
        } else {
          grupo = new Grupo();
          grupo.nombre = nombreGrupo;
          grupo.nombreNormalizado = nombreNormalizado;
          grupo.paradigma = paradigma;
          grupo.assignment = assignment;
          grupo.maxIntegrantes = assignment.maxIntegrantes;
          grupo.creadoPor = "sheets-sync";
          transaction.persist(grupo);
        }

        if (grupo.alumnos.contains(alumno)) return grupo;

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
      })
  );
}
