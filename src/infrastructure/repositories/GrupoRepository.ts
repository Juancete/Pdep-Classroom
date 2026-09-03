import { getEM } from "@/infrastructure/db";
import { LockMode } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import {
  Grupo,
  Alumno,
  GrupalAssignment,
  Assignment,
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  AlumnoNoEsMiembroDelGrupoError,
  type RolDeUsuario,
} from "@/domain/entities";
import type { Paradigma, PdepUser } from "@/types";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { getEntregaLogica } from "./EntregaRepository";
import { registrarCambioDeMembresia } from "./CambioDeMembresiaRepository";

const INSCRIPCION_UNICA_CONSTRAINT =
  "grupo_alumnos_assignment_alumno_unique_idx";
const NOMBRE_GRUPO_UNICO_CONSTRAINT =
  "grupo_assignment_nombre_normalizado_unique_idx";

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

// Conteo de grupos por assignmentId en una sola query — mismo molde que
// `getEntregaCountsByAssignment` (EntregaRepository.ts). Lo usa el panel
// admin para decidir el botón de borrado de assignment sin cargar todos los
// grupos: `Assignment.puedeEliminarse` necesita saber si hay grupos
// asociados, no cuáles (B4 de la auditoría de dominio).
export async function getGrupoCountsByAssignment(): Promise<Map<string, number>> {
  const entityManager = await getEM();
  const grupos = await entityManager.find(Grupo, {}, { fields: ["assignment"] });
  const map = new Map<string, number>();
  for (const grupo of grupos) {
    const assignmentId = grupo.assignment.id;
    map.set(assignmentId, (map.get(assignmentId) ?? 0) + 1);
  }
  return map;
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
  rol: RolDeUsuario;
}): Promise<Grupo> {
  const { assignmentId, alumnoId, nombre, rol } = params;
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
      const grupal = assignment.exigirGrupal();

      const alumno = await transaction.findOneOrFail(
        Alumno,
        { id: alumnoId },
        { populate: ["comision"] }
      );
      rol.autorizarAccionSobreAssignment(alumno, grupal);

      return traducirConflictoDeInscripcion(
        assignmentId,
        alumno.githubUsername,
        async () => {
          // Grupo en memoria (sin persistir todavía) para poder pasarlo al
          // contexto de autorización — recién nace, así que nunca tiene
          // entrega. Delegar acá en el rol (B3 de la auditoría de dominio)
          // en vez de chequear `aceptaNuevasInscripciones()` directo evita
          // que este chequeo divergiera del que ya usan `salirDeGrupo`/
          // `moverAlumnoDeGrupo`: un docente puede crear un grupo aunque las
          // inscripciones estén cerradas, un alumno no. La construcción del
          // Grupo (nombre/nombreNormalizado/validación de longitud) delega
          // en `GrupalAssignment.crearGrupo` (Fase 3 de la auditoría de
          // dominio) — antes vivía acá duplicada con la de `upsertGrupoConMiembro`.
          const grupo = grupal.crearGrupo(nombre, alumno.githubUsername);

          rol.autorizarCambioDeMembresia({
            assignment: grupal,
            grupo,
            grupoTieneEntrega: false,
          });

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

          grupo.alumnos.add(alumno);
          transaction.persist(grupo);

          // realizadoPor = el propio alumno: crearGrupo es siempre
          // self-service, no hay un tercero "actuando por" otro acá.
          await registrarCambioDeMembresia(transaction, {
            assignmentId,
            alumnoId: alumno.id,
            alumnoUsername: alumno.githubUsername,
            grupoDestinoId: grupo.id,
            grupoDestinoNombre: grupo.nombre,
            accion: "alta",
            origen: rol.origenDeAuditoria(),
            realizadoPor: alumno.githubUsername,
            grupoOrigenTeniaEntrega: false,
            grupoOrigenEliminado: false,
          });

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
  usuario: PdepUser;
}): Promise<Grupo> {
  const { assignmentId, grupoId, alumnoId, usuario } = params;
  const rol = usuario.rol;
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
    rol.autorizarAccionSobreAssignment(alumno, assignment);

    return traducirConflictoDeInscripcion(
      assignmentId,
      alumno.githubUsername,
      async () => {
        if (grupo.alumnos.contains(alumno)) {
          return grupo;
        }

        // Mismo criterio que `crearGrupo`: delega en el rol en vez de
        // chequear `aceptaNuevasInscripciones()` directo (B3). `grupoTieneEntrega`
        // en `false` porque acá se está sumando un integrante, no removiendo
        // uno de un grupo que ya entregó — ese caso es el de `salirDeGrupo`/
        // `moverAlumnoDeGrupo`.
        rol.autorizarCambioDeMembresia({
          assignment,
          grupo,
          grupoTieneEntrega: false,
        });

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

        await registrarCambioDeMembresia(transaction, {
          assignmentId,
          alumnoId: alumno.id,
          alumnoUsername: alumno.githubUsername,
          grupoDestinoId: grupo.id,
          grupoDestinoNombre: grupo.nombre,
          accion: "alta",
          origen: rol.origenDeAuditoria(),
          realizadoPor: usuario.githubUsername,
          grupoOrigenTeniaEntrega: false,
          grupoOrigenEliminado: false,
        });

        await transaction.flush();
        return grupo;
      }
    );
  });
}

// Serializa dos cambios de membresía del mismo alumno en el mismo assignment
// (salir, cambiarse) sin tomar un row lock sobre `alumno`. Importante: NO usar
// LockMode.PESSIMISTIC_WRITE sobre la fila de `alumno` acá — `unirseAGrupo`
// toma FOR UPDATE sobre `grupo` y luego, al insertar en el pivot, la FK le
// hace tomar FOR KEY SHARE sobre `alumno`. Si esta función tomara FOR UPDATE
// sobre `alumno` primero y luego sobre `grupo`, el orden de locks quedaría
// invertido entre las dos funciones y produciría un deadlock real entre un
// join concurrente y un cambio de grupo.
async function lockearMembresia(
  transaction: EntityManager,
  assignmentId: string,
  alumnoId: string
): Promise<void> {
  // `transaction.execute(...)` — no `transaction.getConnection().execute(...)`:
  // este último no hereda el contexto de transacción activo y corre en una
  // conexión aparte del pool, así que el advisory lock (transaccional, se
  // libera solo) queda tomado y liberado al instante sin serializar nada.
  await transaction.execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", [
    `membresia:${assignmentId}:${alumnoId}`,
  ]);
}

// Saca al alumno de su grupo. Atómico: el chequeo de si el grupo ya entregó
// se hace DESPUÉS de tomar el lock del grupo, para cerrar la carrera contra
// `crearEntregaSiAssignmentDisponible` (que bloquea el `assignment`, no el
// `grupo`): si la salida llega primero, el insert de la entrega queda
// esperando el lock y al commitear la salida con el grupo ya borrado, el
// insert falla por la FK — no se acepta el TP de un grupo inexistente. Si la
// entrega llega primero, la salida la ve al re-leer bajo el lock y la
// rechaza (o la deja pasar si es el docente) sin borrar nada.
//
// Si el alumno era el último integrante y el grupo nunca tuvo entrega, el
// grupo se borra en la misma transacción — libera su `nombreNormalizado`.
export async function salirDeGrupo(params: {
  assignmentId: string;
  grupoId: string;
  githubUsername: string;
  usuario: PdepUser;
  motivo?: string;
}): Promise<{ grupo: Grupo; grupoEliminado: boolean }> {
  const { assignmentId, grupoId, githubUsername, usuario, motivo } = params;
  const entityManager = await getEM();

  return entityManager.transactional(async (transaction) => {
    const alumno = await transaction.findOneOrFail(Alumno, {
      githubUsername: Alumno.normalizarUsername(githubUsername),
    });

    await lockearMembresia(transaction, assignmentId, alumno.id);

    const grupo = await transaction.findOne(
      Grupo,
      { id: grupoId, assignment: { id: assignmentId } },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!grupo) throw new GrupoNoEncontradoError(assignmentId, grupoId);

    await transaction.populate(
      grupo,
      ["alumnos", "assignment.comision"],
      { refresh: true }
    );

    if (!grupo.alumnos.contains(alumno)) {
      throw new AlumnoNoEsMiembroDelGrupoError(grupo.id, githubUsername);
    }

    const entrega = await getEntregaLogica(
      { assignmentId, grupoId: grupo.id },
      transaction
    );
    const grupoTieneEntrega = !!entrega;

    usuario.rol.autorizarCambioDeMembresia({
      assignment: grupo.assignment,
      grupo,
      grupoTieneEntrega,
    });

    grupo.removeMember(alumno);

    const grupoEliminado = grupo.seEliminaAlSalir(grupoTieneEntrega);
    if (grupoEliminado) transaction.remove(grupo);

    await registrarCambioDeMembresia(transaction, {
      assignmentId,
      alumnoId: alumno.id,
      alumnoUsername: alumno.githubUsername,
      grupoOrigenId: grupo.id,
      grupoOrigenNombre: grupo.nombre,
      accion: "baja",
      origen: usuario.rol.origenDeAuditoria(),
      realizadoPor: usuario.githubUsername,
      grupoOrigenTeniaEntrega: grupoTieneEntrega,
      grupoOrigenEliminado: grupoEliminado,
      motivo,
    });

    await transaction.flush();
    return { grupo, grupoEliminado };
  });
}

// Mueve al alumno a `grupoDestinoId`: alta si no tenía grupo en el
// assignment, cambio si tenía uno, no-op idempotente si ya está en el
// destino. Cubre los tres casos administrativos con una sola operación.
//
// Atómico y no compuesto de salir() + unirse(): si `unirse` fallara por cupo
// después de un `salir` ya confirmado, el alumno quedaría sin grupo (y si
// era el último integrante, su grupo original ya se habría borrado) —
// pérdida irreversible. El orden inverso es imposible: el índice único
// `grupo_alumnos_assignment_alumno_unique_idx` rechaza la segunda inserción
// mientras la primera sigue viva. Acá, si el destino está lleno, el rollback
// de la transacción entera devuelve al alumno a su grupo original.
//
// Los dos grupos (origen y destino) se bloquean en orden ascendente de id,
// nunca por rol (origen/destino): dos llamadas concurrentes que intercambian
// posiciones (A: G1→G2 mientras B: G2→G1) bloquean en el mismo orden global
// y no pueden formar un ciclo de espera.
export async function moverAlumnoDeGrupo(params: {
  assignmentId: string;
  grupoDestinoId: string;
  githubUsername: string;
  usuario: PdepUser;
  motivo?: string;
}): Promise<{ grupoDestino: Grupo; grupoOrigenEliminado: boolean }> {
  const { assignmentId, grupoDestinoId, githubUsername, usuario, motivo } = params;
  const entityManager = await getEM();

  return entityManager.transactional(async (transaction) => {
    const alumno = await transaction.findOneOrFail(Alumno, {
      githubUsername: Alumno.normalizarUsername(githubUsername),
    });

    await lockearMembresia(transaction, assignmentId, alumno.id);

    // Lectura sin lock: solo para saber si hace falta bloquear un segundo
    // grupo y en qué orden. El advisory lock ya serializa cualquier otra
    // llamada a salirDeGrupo/moverAlumnoDeGrupo para este mismo alumno; un
    // unirseAGrupo concurrente e independiente queda cubierto por el índice
    // único de `grupo_alumnos`, que revienta el `addMember` de más abajo si
    // el estado cambió entre esta lectura y el lock.
    const grupoOrigenPrevio = await transaction.findOne(Grupo, {
      assignment: { id: assignmentId },
      alumnos: { id: alumno.id },
    });

    const idsAOrdenar =
      grupoOrigenPrevio && grupoOrigenPrevio.id !== grupoDestinoId
        ? [grupoOrigenPrevio.id, grupoDestinoId].sort()
        : [grupoDestinoId];

    const gruposBloqueados = new Map<string, Grupo>();
    for (const id of idsAOrdenar) {
      const grupo = await transaction.findOne(
        Grupo,
        { id, assignment: { id: assignmentId } },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!grupo) throw new GrupoNoEncontradoError(assignmentId, id);
      await transaction.populate(
        grupo,
        ["alumnos", "assignment.comision"],
        { refresh: true }
      );
      gruposBloqueados.set(id, grupo);
    }

    const grupoDestino = gruposBloqueados.get(grupoDestinoId)!;
    const grupoOrigen = grupoOrigenPrevio
      ? gruposBloqueados.get(grupoOrigenPrevio.id)
      : undefined;

    if (grupoOrigen && grupoOrigen.id === grupoDestino.id) {
      return { grupoDestino, grupoOrigenEliminado: false };
    }

    const entregaOrigen = grupoOrigen
      ? await getEntregaLogica(
          { assignmentId, grupoId: grupoOrigen.id },
          transaction
        )
      : null;
    const grupoOrigenTeniaEntrega = !!entregaOrigen;

    usuario.rol.autorizarCambioDeMembresia({
      assignment: grupoDestino.assignment,
      grupo: grupoOrigen ?? grupoDestino,
      grupoTieneEntrega: grupoOrigenTeniaEntrega,
    });

    let grupoOrigenEliminado = false;
    if (grupoOrigen) {
      grupoOrigen.removeMember(alumno);
      grupoOrigenEliminado = grupoOrigen.seEliminaAlSalir(grupoOrigenTeniaEntrega);
      if (grupoOrigenEliminado) transaction.remove(grupoOrigen);
      // El DELETE del pivot origen tiene que emitirse antes del INSERT del
      // destino, o el índice único (assignment_id, alumno_id) revienta: la
      // UnitOfWork no garantiza ese orden entre colecciones de dos entidades
      // distintas dentro del mismo flush.
      await transaction.flush();
    }

    await traducirConflictoDeInscripcion(
      assignmentId,
      alumno.githubUsername,
      async () => {
        grupoDestino.addMember(alumno);
        await transaction.flush();
      }
    );

    await registrarCambioDeMembresia(transaction, {
      assignmentId,
      alumnoId: alumno.id,
      alumnoUsername: alumno.githubUsername,
      grupoOrigenId: grupoOrigen?.id,
      grupoOrigenNombre: grupoOrigen?.nombre,
      grupoDestinoId: grupoDestino.id,
      grupoDestinoNombre: grupoDestino.nombre,
      accion: grupoOrigen ? "cambio" : "alta",
      origen: usuario.rol.origenDeAuditoria(),
      realizadoPor: usuario.githubUsername,
      grupoOrigenTeniaEntrega,
      grupoOrigenEliminado,
      motivo,
    });
    await transaction.flush();

    return { grupoDestino, grupoOrigenEliminado };
  });
}

// Usado por la sincronización desde la planilla: crea el Grupo (nombre +
// paradigma + assignment) si no existe, y agrega al alumno como miembro
// si no lo era. Idempotente.
//
// A propósito, sin auditoría en cambio_membresia: no hay un "realizadoPor"
// humano (la sync corre en background) y correrla para cada fila de la
// planilla en cada resync masivo generaría ruido, no señal. La limitación
// real de esta función — que sólo agrega, nunca reconcilia bajas — queda
// documentada en sincronizarGruposDelAlumno (src/lib/services/grupoSync.ts).
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
  // `paradigma` ya no se usa acá — `GrupalAssignment.crearGrupo` deriva el
  // paradigma del propio assignment, y el único caller (`grupoSync.ts`)
  // sólo llama con assignments ya filtrados por ese mismo paradigma, así
  // que siempre coinciden. Se conserva en la firma pública por
  // compatibilidad (Fase 3 de la auditoría de dominio).
  paradigma: Paradigma;
  assignment: GrupalAssignment;
  alumno: Alumno;
}): Promise<Grupo> {
  const { assignment, alumno } = params;
  // Candidato en memoria: deriva nombre/nombreNormalizado y valida la
  // longitud del repo resultante (delegado en `GrupalAssignment.crearGrupo`
  // — antes duplicado con `crearGrupo` de este mismo archivo). Se descarta
  // si ya existe un grupo con ese `nombreNormalizado`.
  const candidato = assignment.crearGrupo(params.nombreGrupo, "sheets-sync");
  const entityManager = await getEM();

  return traducirConflictoDeInscripcion(
    assignment.id,
    alumno.githubUsername,
    () =>
      entityManager.transactional(async (transaction) => {
        const existente = await transaction.findOne(
          Grupo,
          {
            nombreNormalizado: candidato.nombreNormalizado,
            assignment: { id: assignment.id },
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE }
        );

        let grupo: Grupo;
        if (existente) {
          if (existente.nombre !== candidato.nombre) {
            throw new NombreGrupoDuplicadoError(
              assignment.id,
              candidato.nombre
            );
          }
          grupo = existente;
          await transaction.populate(grupo, ["alumnos"], { refresh: true });
        } else {
          grupo = candidato;
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
