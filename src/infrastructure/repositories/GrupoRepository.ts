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
  GrupoNoAdmiteParticipanteError,
  type Participante,
  type ActorDeMembresia,
} from "@/domain/entities";
import type { Paradigma } from "@/types";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import { getEntregaLogica } from "./EntregaRepository";
import type { AccesoAlRepositorioDeGrupo } from "./AccesoAlRepositorio";
import { registrarCambioDeMembresia } from "./CambioDeMembresiaRepository";
import { getAlumnoByGithub } from "./AlumnoRepository";

const INSCRIPCION_UNICA_CONSTRAINT =
  "grupo_miembro_assignment_username_unique_idx";
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
    { miembros: { githubUsername: { $ilike: githubUsername } } },
    { populate: ["assignment", "miembros"] }
  );
  return new Map(grupos.map((grupo) => [grupo.assignment.id, grupo]));
}

// `comisionId` obligatorio (issue #114): único llamador es la página de
// grupos del panel admin, que ahora filtra siempre por la comisión
// consultada (activa u histórica) en vez de traer grupos de todas las
// comisiones a la vez.
export async function getGrupos(filtro: {
  comisionId: string;
  paradigma?: Paradigma;
}): Promise<Grupo[]> {
  const entityManager = await getEM();
  const { comisionId, paradigma } = filtro;
  return entityManager.find(
    Grupo,
    {
      assignment: { comision: { id: comisionId } },
      ...(paradigma && { paradigma }),
    },
    { populate: ["assignment", "miembros"] }
  );
}

export async function getGruposDeAssignment(assignmentId: string): Promise<Grupo[]> {
  const entityManager = await getEM();
  return entityManager.find(
    Grupo,
    { assignment: { id: assignmentId } },
    { populate: ["miembros"] }
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
      miembros: { githubUsername: { $ilike: githubUsername } },
    },
    { populate: ["miembros"] }
  );
}

// Crea un grupo nuevo en un assignment grupal y suma al participante creador
// como primer miembro (del tipo que ese participante integra — issue
// #107/#112: un alumno crea un grupo de alumnos, un docente uno de
// docentes). Atómico: la lectura del assignment, la verificación de que el
// participante no esté ya en otro grupo, y la creación se hacen en una única
// transacción para evitar carreras (dos creaciones simultáneas, o crear
// mientras un join concurrente está en curso).
export async function crearGrupo(params: {
  assignmentId: string;
  nombre: string;
  participante: Participante;
}): Promise<Grupo> {
  const { assignmentId, nombre, participante } = params;
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

      participante.autorizarAccionSobreAssignment(grupal);

      return traducirConflictoDeInscripcion(
        assignmentId,
        participante.githubUsername,
        async () => {
          // Grupo en memoria (sin persistir todavía) para poder pasarlo al
          // contexto de autorización — recién nace, así que nunca tiene
          // entrega. La construcción del Grupo (nombre/nombreNormalizado/
          // validación de longitud) delega en `GrupalAssignment.crearGrupo`
          // (Fase 3 de la auditoría de dominio) — antes vivía acá duplicada
          // con la de `upsertGrupoConMiembro`.
          const grupo = grupal.crearGrupo(
            nombre,
            participante.githubUsername,
            participante.tipoDeGrupo()
          );

          participante.autorizarAltaEnGrupo({ assignment: grupal, grupo });

          const yaEnGrupo = await transaction.findOne(Grupo, {
            assignment: { id: assignmentId },
            miembros: { githubUsername: participante.githubUsername },
          });
          if (yaEnGrupo) {
            throw new AlumnoYaEnGrupoDelAssignmentError(
              assignmentId,
              participante.githubUsername
            );
          }

          grupo.agregarMiembro(participante.githubUsername, participante.alumno);
          transaction.persist(grupo);

          // realizadoPor = el propio participante: crearGrupo es siempre
          // self-service, no hay un tercero "actuando por" otro acá.
          await registrarCambioDeMembresia(transaction, {
            assignmentId,
            alumnoId: participante.alumnoId(),
            alumnoUsername: participante.githubUsername,
            grupoDestinoId: grupo.id,
            grupoDestinoNombre: grupo.nombre,
            accion: "alta",
            origen: participante.origenDeAuditoria(),
            realizadoPor: participante.githubUsername,
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

// Suma al participante como miembro de un grupo existente. Atómico: re-checa
// cupo y "no está en otro grupo del mismo assignment" dentro de la
// transacción para resolver el race del último cupo (dos joins simultáneos
// al mismo grupo cuando queda un solo lugar).
export async function unirseAGrupo(params: {
  assignmentId: string;
  grupoId: string;
  participante: Participante;
  // Obligatorio y sin default a propósito: un default no-op dejaría a un
  // caller que se olvida sin acceso al repo, en silencio (issue #123).
  acceso: AccesoAlRepositorioDeGrupo;
}): Promise<Grupo> {
  const { assignmentId, grupoId, participante, acceso } = params;
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
      ["miembros", "assignment.comision"],
      { refresh: true }
    );

    const assignment = grupo.assignment;
    participante.autorizarAccionSobreAssignment(assignment);

    // Un alumno no ve ni puede unirse a un grupo de docentes, y viceversa
    // (issue #107/#112) — antes de tocar cupos ni membresías.
    if (!grupo.admiteIntegrantesDe(participante.tipoDeGrupo())) {
      throw new GrupoNoAdmiteParticipanteError(grupo.id);
    }

    return traducirConflictoDeInscripcion(
      assignmentId,
      participante.githubUsername,
      async () => {
        if (grupo.contieneA(participante.githubUsername)) {
          return grupo;
        }

        // El alta no depende de si el grupo ya aceptó el TP (issue #123).
        participante.autorizarAltaEnGrupo({ assignment, grupo });

        const enOtroGrupo = await transaction.findOne(Grupo, {
          assignment: { id: assignment.id },
          miembros: { githubUsername: participante.githubUsername },
        });
        if (enOtroGrupo) {
          throw new AlumnoYaEnGrupoDelAssignmentError(
            assignment.id,
            participante.githubUsername
          );
        }

        grupo.agregarMiembro(participante.githubUsername, participante.alumno);

        await registrarCambioDeMembresia(transaction, {
          assignmentId,
          alumnoId: participante.alumnoId(),
          alumnoUsername: participante.githubUsername,
          grupoDestinoId: grupo.id,
          grupoDestinoNombre: grupo.nombre,
          accion: "alta",
          origen: participante.origenDeAuditoria(),
          realizadoPor: participante.githubUsername,
          grupoOrigenTeniaEntrega: false,
          grupoOrigenEliminado: false,
        });

        await transaction.flush();

        // Va al final para no pagar red por requests que iban a fallar y
        // acotar el tiempo que se sostiene el lock del grupo a una llamada.
        // Si lanza, `transactional` hace rollback del alta. Sobre la carrera
        // con la creación del repo, ver la nota en `lockearMembresia`.
        await acceso.otorgarA(
          { assignmentId, grupoId: grupo.id, githubUsername: participante.githubUsername },
          transaction
        );
        return grupo;
      }
    );
  });
}

// Serializa dos cambios de membresía del mismo username en el mismo assignment
// (salir, cambiarse) sin tomar un row lock sobre `alumno`. Importante: NO usar
// LockMode.PESSIMISTIC_WRITE sobre la fila de `alumno` acá — `unirseAGrupo`
// toma FOR UPDATE sobre `grupo` y luego, al insertar en el pivot, la FK le
// hace tomar FOR KEY SHARE sobre `alumno`. Si esta función tomara FOR UPDATE
// sobre `alumno` primero y luego sobre `grupo`, el orden de locks quedaría
// invertido entre las dos funciones y produciría un deadlock real entre un
// join concurrente y un cambio de grupo.
//
// Clave por `githubUsername` (canónico), no por `alumnoId`: desde el issue
// #107/#112 la membresía se administra por username y no todo integrante
// tiene una fila en `Alumno` (un docente en un grupo de demo).
//
// Invariante: ninguna llamada externa dentro de una transacción debería usar
// una política con reintentos largos (ver `SIN_REINTENTOS`). Además,
// `unirseAGrupo` lockea la fila de `grupo` y `crearEntregaSiAssignmentDisponible`
// lockea `assignment`: NO se serializan, así que si el alta ocurre mientras
// otro integrante está creando el repo puede no ver la entrega todavía y
// quedar sin invitar. Ese hueco lo cubre el self-heal de `aceptarAssignment`
// (issue #123).
async function lockearMembresia(
  transaction: EntityManager,
  assignmentId: string,
  githubUsername: string
): Promise<void> {
  // `transaction.execute(...)` — no `transaction.getConnection().execute(...)`:
  // este último no hereda el contexto de transacción activo y corre en una
  // conexión aparte del pool, así que el advisory lock (transaccional, se
  // libera solo) queda tomado y liberado al instante sin serializar nada.
  await transaction.execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", [
    `membresia:${assignmentId}:${githubUsername}`,
  ]);
}

// Saca al alumno de su grupo. Atómico: el chequeo de si el grupo ya aceptó el TP
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
//
// A diferencia de `crearGrupo`/`unirseAGrupo` (que reciben un `Participante`
// ya resuelto), acá no se resuelve un `Alumno` de antemano: el miembro se
// busca por username dentro del propio grupo ya bloqueado — el vínculo con
// `Alumno` (si existe) viaja con el `MiembroDeGrupo` encontrado.
//
// `actor`/`realizadoPor` separados de `githubUsername` (a quién se le saca
// del grupo): quien actúa puede ser el propio interesado (`Participante`,
// self-service) o un docente administrando a otro (`RolDeUsuario.actorSobreMembresiaAjena()`)
// — `ActorDeMembresia` cubre ambos casos con la misma firma.
export async function salirDeGrupo(params: {
  assignmentId: string;
  grupoId: string;
  githubUsername: string;
  actor: ActorDeMembresia;
  realizadoPor: string;
  motivo?: string;
  // Obligatorio y sin default a propósito: un default no-op dejaría a un
  // caller que se olvida con el acceso al repo desactualizado, en silencio
  // (issue #123).
  acceso: AccesoAlRepositorioDeGrupo;
}): Promise<{ grupo: Grupo; grupoEliminado: boolean }> {
  const { assignmentId, grupoId, githubUsername, actor, realizadoPor, motivo, acceso } = params;
  const entityManager = await getEM();
  const usernameCanonico = Alumno.normalizarUsername(githubUsername);

  return entityManager.transactional(async (transaction) => {
    await lockearMembresia(transaction, assignmentId, usernameCanonico);

    const grupo = await transaction.findOne(
      Grupo,
      { id: grupoId, assignment: { id: assignmentId } },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!grupo) throw new GrupoNoEncontradoError(assignmentId, grupoId);

    await transaction.populate(
      grupo,
      ["miembros", "assignment.comision"],
      { refresh: true }
    );

    const miembro = grupo.miembroConUsername(usernameCanonico);
    if (!miembro) {
      throw new AlumnoNoEsMiembroDelGrupoError(grupo.id, githubUsername);
    }

    const entrega = await getEntregaLogica(
      { assignmentId, grupoId: grupo.id },
      transaction
    );
    const grupoTieneEntrega = !!entrega;

    actor.autorizarBajaDeGrupo({
      assignment: grupo.assignment,
      grupo,
      grupoTieneEntrega,
    });

    grupo.quitarMiembro(usernameCanonico);

    const grupoEliminado = grupo.seEliminaAlSalir(grupoTieneEntrega);
    if (grupoEliminado) transaction.remove(grupo);

    await registrarCambioDeMembresia(transaction, {
      assignmentId,
      alumnoId: miembro.alumno?.id,
      alumnoUsername: miembro.githubUsername,
      grupoOrigenId: grupo.id,
      grupoOrigenNombre: grupo.nombre,
      accion: "baja",
      origen: actor.origenDeAuditoria(),
      realizadoPor,
      grupoOrigenTeniaEntrega: grupoTieneEntrega,
      grupoOrigenEliminado: grupoEliminado,
      motivo,
    });

    await transaction.flush();

    // Siempre se llama: la regla "¿hay repo activo?" vive en el adapter, que
    // hace no-op si la entrega no existe (ej. el grupo recién eliminado).
    await acceso.revocarA(
      { assignmentId, grupoId: grupo.id, githubUsername: miembro.githubUsername },
      transaction
    );
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
// `grupo_miembro_assignment_username_unique_idx` rechaza la segunda inserción
// mientras la primera sigue viva. Acá, si el destino está lleno, el rollback
// de la transacción entera devuelve al alumno a su grupo original.
//
// Los dos grupos (origen y destino) se bloquean en orden ascendente de id,
// nunca por rol (origen/destino): dos llamadas concurrentes que intercambian
// posiciones (A: G1→G2 mientras B: G2→G1) bloquean en el mismo orden global
// y no pueden formar un ciclo de espera.
//
// El vínculo con `Alumno` se resuelve por username, no de antemano: si ya
// tenía grupo en el assignment, se hereda el `alumno` del `MiembroDeGrupo`
// origen (con o sin vínculo); si es un alta (sin grupo origen), se busca por
// `getAlumnoByGithub` y, si no existe fila en `Alumno`, el miembro nuevo
// queda sin vínculo (issue #107/#112: infraestructura para que un docente
// sin registro pueda terminar acá vía las mismas rutas administrativas).
export async function moverAlumnoDeGrupo(params: {
  assignmentId: string;
  grupoDestinoId: string;
  githubUsername: string;
  actor: ActorDeMembresia;
  realizadoPor: string;
  motivo?: string;
  // Obligatorio y sin default a propósito: un default no-op dejaría a un
  // caller que se olvida con el acceso al repo desactualizado, en silencio
  // (issue #123).
  acceso: AccesoAlRepositorioDeGrupo;
}): Promise<{ grupoDestino: Grupo; grupoOrigenEliminado: boolean }> {
  const { assignmentId, grupoDestinoId, githubUsername, actor, realizadoPor, motivo, acceso } =
    params;
  const entityManager = await getEM();
  const usernameCanonico = Alumno.normalizarUsername(githubUsername);

  return entityManager.transactional(async (transaction) => {
    await lockearMembresia(transaction, assignmentId, usernameCanonico);

    // Lectura sin lock: solo para saber si hace falta bloquear un segundo
    // grupo y en qué orden. El advisory lock ya serializa cualquier otra
    // llamada a salirDeGrupo/moverAlumnoDeGrupo para este mismo username; un
    // unirseAGrupo concurrente e independiente queda cubierto por el índice
    // único de `grupo_miembro`, que revienta el `agregarMiembro` de más abajo
    // si el estado cambió entre esta lectura y el lock.
    const grupoOrigenPrevio = await transaction.findOne(Grupo, {
      assignment: { id: assignmentId },
      miembros: { githubUsername: usernameCanonico },
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
        ["miembros", "assignment.comision"],
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

    // Acceso al assignment antes de decidir el tipo requerido (revisión de
    // code review, issue #107/#112): en self-service, `actor` es el propio
    // `Participante` y esto repite la misma regla que ya exige
    // `unirseAGrupo` (comisión + estado) — sin esto, un docente o un alumno
    // sin registro podían darse de alta acá aunque `unirseAGrupo` los
    // hubiera rechazado. Administrando a otro, el docente conserva su
    // alcance global (no-op).
    actor.autorizarAccionSobreAssignment(grupoDestino.assignment);

    // El tipo que debe admitir el destino lo decide el actor, no el grupo
    // origen directamente: en self-service es siempre el tipo del propio
    // participante (issue #107/#112 — un docente nunca puede terminar en un
    // grupo de alumnos, tenga o no grupo origen); administrando a otro, el
    // docente sigue moviendo dentro del mismo tipo del grupo origen, o
    // "alumnos" si es un alta sin origen (la lista "sin grupo" del panel
    // admin sólo tiene alumnos).
    const tipoRequerido = actor.tipoDeGrupoAlIngresar(grupoOrigen ?? null);
    if (!grupoDestino.admiteIntegrantesDe(tipoRequerido)) {
      throw new GrupoNoAdmiteParticipanteError(grupoDestino.id);
    }

    const entregaOrigen = grupoOrigen
      ? await getEntregaLogica(
          { assignmentId, grupoId: grupoOrigen.id },
          transaction
        )
      : null;
    const grupoOrigenTeniaEntrega = !!entregaOrigen;

    if (grupoOrigen) {
      actor.autorizarBajaDeGrupo({
        assignment: grupoDestino.assignment,
        grupo: grupoOrigen,
        grupoTieneEntrega: grupoOrigenTeniaEntrega,
      });
    }
    actor.autorizarAltaEnGrupo({
      assignment: grupoDestino.assignment,
      grupo: grupoDestino,
    });

    const miembroOrigen = grupoOrigen?.miembroConUsername(usernameCanonico);
    const alumnoVinculado =
      miembroOrigen?.alumno ??
      (await getAlumnoByGithub(usernameCanonico, false, transaction));

    // Un grupo de alumnos no admite un miembro sin fila en `Alumno` (issue
    // #107, revisión de code review): en self-service ya lo impide el
    // acceso, pero un docente administrando a otro podía dar de alta
    // cualquier username sin registro.
    if (grupoDestino.exigeVinculoConAlumno() && !alumnoVinculado) {
      throw new GrupoNoAdmiteParticipanteError(grupoDestino.id);
    }

    let grupoOrigenEliminado = false;
    if (grupoOrigen) {
      grupoOrigen.quitarMiembro(usernameCanonico);
      grupoOrigenEliminado = grupoOrigen.seEliminaAlSalir(grupoOrigenTeniaEntrega);
      if (grupoOrigenEliminado) transaction.remove(grupoOrigen);
      // El DELETE del pivot origen tiene que emitirse antes del INSERT del
      // destino, o el índice único (assignment_id, github_username) revienta:
      // la UnitOfWork no garantiza ese orden entre colecciones de dos
      // entidades distintas dentro del mismo flush.
      await transaction.flush();
    }

    await traducirConflictoDeInscripcion(
      assignmentId,
      usernameCanonico,
      async () => {
        grupoDestino.agregarMiembro(usernameCanonico, alumnoVinculado ?? null);
        await transaction.flush();
      }
    );

    await registrarCambioDeMembresia(transaction, {
      assignmentId,
      alumnoId: alumnoVinculado?.id,
      alumnoUsername: usernameCanonico,
      grupoOrigenId: grupoOrigen?.id,
      grupoOrigenNombre: grupoOrigen?.nombre,
      grupoDestinoId: grupoDestino.id,
      grupoDestinoNombre: grupoDestino.nombre,
      accion: grupoOrigen ? "cambio" : "alta",
      origen: actor.origenDeAuditoria(),
      realizadoPor,
      grupoOrigenTeniaEntrega,
      grupoOrigenEliminado,
      motivo,
    });
    await transaction.flush();

    // Primero se revoca y después se otorga, a propósito: GitHub no es
    // transaccional, así que si algo falla a mitad de camino el alumno queda
    // con MENOS acceso (falla cerrada) y no con más. El docente ve el error y
    // reintenta: ambas operaciones son idempotentes.
    if (grupoOrigen) {
      await acceso.revocarA(
        { assignmentId, grupoId: grupoOrigen.id, githubUsername: usernameCanonico },
        transaction
      );
    }
    await acceso.otorgarA(
      { assignmentId, grupoId: grupoDestino.id, githubUsername: usernameCanonico },
      transaction
    );

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
          // La planilla sólo importa alumnos: un grupo de docentes homónimo
          // no se reutiliza, se informa como nombre ya tomado (issue #107).
          if (!existente.admiteIntegrantesDe("alumnos")) {
            throw new NombreGrupoDuplicadoError(assignment.id, candidato.nombre);
          }
          grupo = existente;
          await transaction.populate(grupo, ["miembros"], { refresh: true });
        } else {
          grupo = candidato;
          transaction.persist(grupo);
        }

        if (grupo.contieneA(alumno.githubUsername)) return grupo;

        const enOtroGrupo = await transaction.findOne(Grupo, {
          assignment: { id: assignment.id },
          miembros: { githubUsername: alumno.githubUsername },
        });
        if (enOtroGrupo) {
          throw new AlumnoYaEnGrupoDelAssignmentError(
            assignment.id,
            alumno.githubUsername
          );
        }

        grupo.agregarMiembro(alumno.githubUsername, alumno);
        await transaction.flush();
        return grupo;
      })
  );
}
