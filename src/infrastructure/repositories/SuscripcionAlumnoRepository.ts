import { getEM } from "@/infrastructure/db";
import type { EntityManager } from "@mikro-orm/postgresql";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import {
  Alumno,
  SuscripcionAlumno,
  NOMBRES_DE_CANAL,
  type NombreDeCanal,
} from "@/domain/entities";

/**
 * Busca la suscripción de un alumno a un canal, creándola si todavía no
 * existe (get-or-create). Alta concurrencia (doble submit en /registro, o
 * registro + reintento de /perfil en simultáneo) puede pisar el UNIQUE de
 * (alumno, canal); si eso pasa, releemos en vez de fallar — la fila que
 * ganó la carrera es la que corresponde usar.
 */
async function buscarOCrearSuscripcion(
  entityManager: EntityManager,
  alumno: Alumno,
  canal: NombreDeCanal
): Promise<SuscripcionAlumno> {
  const existente = await entityManager.findOne(SuscripcionAlumno, {
    alumno,
    canal,
  });
  if (existente) return existente;

  const suscripcion = new SuscripcionAlumno();
  suscripcion.alumno = alumno;
  suscripcion.canal = canal;
  entityManager.persist(suscripcion);
  try {
    await entityManager.flush();
    return suscripcion;
  } catch (error) {
    if (!(error instanceof UniqueConstraintViolationException)) throw error;
    entityManager.remove(suscripcion);
    const ganadora = await entityManager.findOne(SuscripcionAlumno, {
      alumno,
      canal,
    });
    if (!ganadora) throw error;
    return ganadora;
  }
}

/**
 * Busca la suscripción de `githubUsername` al `canal`, aplica el mutador y
 * flushea. Molde: `actualizarEstadoGoogleGroup`. Devuelve `null` si el
 * alumno no existe.
 */
export async function actualizarSuscripcion(
  githubUsername: string,
  canal: NombreDeCanal,
  actualizar: (suscripcion: SuscripcionAlumno, alumno: Alumno) => void
): Promise<SuscripcionAlumno | null> {
  const entityManager = await getEM();
  const alumno = await entityManager.findOne(Alumno, {
    githubUsername: Alumno.normalizarUsername(githubUsername),
  });
  if (!alumno) return null;

  const suscripcion = await buscarOCrearSuscripcion(entityManager, alumno, canal);
  actualizar(suscripcion, alumno);
  await entityManager.flush();
  return suscripcion;
}

/** Suscripciones pendientes de una comisión, para los canales dados. */
export async function getSuscripcionesPendientesDeComision(
  comisionId: string,
  canales: NombreDeCanal[]
): Promise<SuscripcionAlumno[]> {
  if (canales.length === 0) return [];
  const entityManager = await getEM();
  return entityManager.find(
    SuscripcionAlumno,
    {
      canal: { $in: canales },
      estado: { $ne: "sincronizada" },
      alumno: { comision: { id: comisionId } },
    },
    {
      populate: ["alumno"],
      orderBy: { alumno: { apellido: "ASC", nombre: "ASC" } },
    }
  );
}

/** Suscripciones de un alumno puntual, para los canales dados. */
export async function getSuscripcionesDeAlumno(
  alumnoId: string,
  canales: NombreDeCanal[]
): Promise<SuscripcionAlumno[]> {
  if (canales.length === 0) return [];
  const entityManager = await getEM();
  return entityManager.find(SuscripcionAlumno, {
    alumno: { id: alumnoId },
    canal: { $in: canales },
  });
}

/**
 * Crea la fila de suscripción "pendiente" (default de la entidad) para cada
 * canal declarado, para los alumnos que todavía no la tienen. Se llama en el
 * mismo flush del alta/import: sin esto, "sin fila" no se distingue de
 * "pendiente" y un alumno recién importado queda invisible para el badge
 * admin y para `/perfil` hasta que alguien lo note manualmente.
 *
 * Crea para TODOS los `NOMBRES_DE_CANAL`, no solo los configurados: un canal
 * puede activarse después de la importación, y su fila ya tiene que existir.
 */
export async function crearSuscripcionesFaltantes(
  alumnos: Alumno[],
  entityManager: EntityManager
): Promise<void> {
  if (alumnos.length === 0) return;

  const existentes = await entityManager.find(SuscripcionAlumno, {
    alumno: { $in: alumnos.map((alumno) => alumno.id) },
  });
  const clavesExistentes = new Set(
    existentes.map((suscripcion) => `${suscripcion.alumno.id}:${suscripcion.canal}`)
  );

  for (const alumno of alumnos) {
    for (const canal of NOMBRES_DE_CANAL) {
      if (clavesExistentes.has(`${alumno.id}:${canal}`)) continue;
      const suscripcion = new SuscripcionAlumno();
      suscripcion.alumno = alumno;
      suscripcion.canal = canal;
      entityManager.persist(suscripcion);
    }
  }
}

/**
 * Vuelve a "pendiente" (con el error limpio) todas las suscripciones de los
 * alumnos dados, en cualquier canal. Se usa cuando cambia un dato de
 * identidad del alumno (hoy el email) que invalida lo ya sincronizado.
 */
export async function marcarSuscripcionesPendientes(
  alumnoIds: string[],
  entityManager: EntityManager
): Promise<void> {
  if (alumnoIds.length === 0) return;
  const suscripciones = await entityManager.find(SuscripcionAlumno, {
    alumno: { $in: alumnoIds },
  });
  for (const suscripcion of suscripciones) {
    suscripcion.marcarPendiente();
  }
}
