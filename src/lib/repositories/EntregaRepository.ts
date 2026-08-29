import { getEM } from "@/lib/db";
import { LockMode } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";
import {
  Alumno,
  Assignment,
  AssignmentNoDisponibleError,
  Grupo,
  Entrega,
  type RolDeUsuario,
  type NombreResultadoCI,
} from "@/domain/entities";

export async function getEntregas(assignmentId?: string): Promise<Entrega[]> {
  const entityManager = await getEM();
  const where = assignmentId ? { assignment: { id: assignmentId } } : {};
  return entityManager.find(Entrega, where, { populate: ["assignment", "grupo"] });
}

// Conteo puntual vía agregación SQL — a diferencia de getEntregaCountsByAssignment()
// más abajo, no carga las entregas en memoria. Lo usa la guarda de "¿tiene
// entregas?" al despublicar un assignment.
export async function contarEntregasDeAssignment(
  assignmentId: string
): Promise<number> {
  const entityManager = await getEM();
  return entityManager.count(Entrega, { assignment: { id: assignmentId } });
}

// Devuelve todas las entregas de un usuario de una sola query,
// indexadas por assignmentId para lookup O(1) en el template.
export async function getEntregasDeUsuario(
  githubUsername: string
): Promise<Map<string, Entrega>> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(Entrega, {});
  const map = new Map<string, Entrega>();
  for (const entrega of entregas) {
    if (entrega.perteneceA(githubUsername)) {
      map.set(entrega.assignment.id, entrega);
    }
  }
  return map;
}

export async function getEntregaDeUsuario(
  assignmentId: string,
  githubUsername: string
): Promise<Entrega | null> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(Entrega, { assignment: { id: assignmentId } });
  return entregas.find((entrega) => entrega.perteneceA(githubUsername)) ?? null;
}

export async function getEntregaPorId(
  entregaId: string,
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  return entityManager.findOne(
    Entrega,
    { id: entregaId },
    { populate: ["assignment"] }
  );
}

export async function getEntregaByRepoName(
  repoName: string,
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  return entityManager.findOne(
    Entrega,
    { repoName },
    { populate: ["assignment", "grupo", "alumno"] }
  );
}

// Id numérico de GitHub del repo (issue #60) — a diferencia del nombre, no
// cambia con un rename. Ver `Entrega.repoGithubId`.
export async function getEntregaPorRepoGithubId(
  repoGithubId: string,
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  return entityManager.findOne(
    Entrega,
    { repoGithubId },
    { populate: ["assignment", "grupo", "alumno"] }
  );
}

// Autocompleta `repoGithubId` la primera vez que se conoce (self-heal) —
// no hace falta poblarlo al crear la entrega, se toma del primer webhook
// que llegue para ese repo. Idempotente: si ya está seteado, no hace nada.
export async function asegurarRepoGithubId(
  entregaId: string,
  repoGithubId: string
): Promise<void> {
  const entityManager = await getEM();
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (!entrega.autocompletarRepoGithubId(repoGithubId)) return;
  await entityManager.flush();
}

export async function getEntregaLogica(
  data: {
    assignmentId: string;
    alumnoId?: string;
    grupoId?: string;
  },
  em?: EntityManager
): Promise<Entrega | null> {
  const entityManager = em ?? (await getEM());
  if (data.grupoId) {
    return entityManager.findOne(
      Entrega,
      { assignment: { id: data.assignmentId }, grupo: { id: data.grupoId } },
      { populate: ["assignment", "grupo", "alumno"] }
    );
  }
  if (data.alumnoId) {
    return entityManager.findOne(
      Entrega,
      { assignment: { id: data.assignmentId }, alumno: { id: data.alumnoId } },
      { populate: ["assignment", "grupo", "alumno"] }
    );
  }
  return null;
}

// Devuelve el conteo de entregas por assignmentId en una sola query.
export async function getEntregaCountsByAssignment(): Promise<Map<string, number>> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(Entrega, {}, { fields: ["assignment"] });
  const map = new Map<string, number>();
  for (const entrega of entregas) {
    const assignmentId = entrega.assignment.id;
    map.set(assignmentId, (map.get(assignmentId) ?? 0) + 1);
  }
  return map;
}

// Mismo criterio que `Entrega.hasRepo()` (B2 de la auditoría de dominio):
// antes sólo filtraba `repoDeleted`/`repoName` y contaba también una entrega
// `fallida` con `repoName` residual de un intento previo, divergiendo del
// conteo que usa `sincronizarCI` para elegir qué entregas consultar.
export async function getActiveRepoCountsByAssignment(): Promise<Map<string, number>> {
  const entityManager = await getEM();
  const entregas = await entityManager.find(
    Entrega,
    { repoDeleted: false, provisionEstado: "activa" },
    { fields: ["assignment", "repoName"] }
  );
  const map = new Map<string, number>();
  for (const entrega of entregas) {
    if (!entrega.repoName) continue;
    const assignmentId = entrega.assignment.id;
    map.set(assignmentId, (map.get(assignmentId) ?? 0) + 1);
  }
  return map;
}

// Mismo criterio que `Entrega.hasRepo()` — ver comentario de
// `getActiveRepoCountsByAssignment`.
export async function getEntregasConRepoActivo(
  assignmentId: string
): Promise<Entrega[]> {
  const entityManager = await getEM();
  return entityManager.find(Entrega, {
    assignment: { id: assignmentId },
    repoDeleted: false,
    provisionEstado: "activa",
    repoName: { $ne: null },
  });
}

// Persiste el resultado de la última consulta de CI (issue #58) — delega en
// `Entrega.registrarResultadoCI` (Fase 2 de la auditoría de dominio): acá
// sólo queda cargar, delegar y flushear.
export async function actualizarCIDeEntrega(
  entregaId: string,
  data: {
    resultadoNombre: NombreResultadoCI;
    checkSuiteIds?: string[] | null;
    commitSha?: string | null;
    detalleUrl?: string | null;
    ejecutadoEn?: Date | null;
  },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  entrega.registrarResultadoCI(data);
  await entityManager.flush();
}

/**
 * Serializa el trabajo protegido del webhook sobre una misma entrega bajo un
 * advisory lock transaccional — mismo mecanismo que
 * `conLockBorradoReposAssignment`. La operación recibe el `EntityManager` de
 * ESA transacción y debe usarlo para las lecturas/escrituras protegidas; así
 * el lock y el read-modify-write comparten conexión y frontera atómica.
 */
export async function conLockDeEntrega<T>(
  entregaId: string,
  operation: (transaction: EntityManager) => Promise<T>
): Promise<T> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    await transaction
      .getConnection()
      .execute("select pg_advisory_xact_lock(hashtextextended(?, 0))", [`ci:${entregaId}`]);
    return operation(transaction);
  });
}

// Actividad reciente del repo (issue #60) — la escribe el webhook de `push`.
// Delega en `Entrega.registrarPush` (guard de orden adentro — Fase 2 de la
// auditoría de dominio); acá sólo queda cargar, delegar y flushear si se
// aplicó.
export async function actualizarActividadDeEntrega(
  entregaId: string,
  data: { pusheadoEn: Date; commitSha: string; por: string },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (!entrega.registrarPush(data)) return;
  await entityManager.flush();
}

// El webhook de `repository.deleted` (issue #60) — mismo campo que ya
// escribe `completarIntentoBorradoRepo` cuando el borrado lo inicia
// Classroom, así que la grilla de entregas no necesita distinguir el
// origen. Delega en `Entrega.marcarRepoBorrado` (guard de orden de
// `esEventoRepositoryViejo` adentro — Fase 2 de la auditoría de dominio).
export async function marcarRepoBorrado(
  entregaId: string,
  eventoActualizadoEn?: Date,
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (!entrega.marcarRepoBorrado(eventoActualizadoEn)) return;
  await entityManager.flush();
}

// El webhook de `repository.renamed` (issue #60): el repo sigue siendo el
// mismo, sólo cambia de nombre/URL — se busca por el nombre viejo (o por
// `repoGithubId`, ver `getEntregaPorRepoGithubId`) y se reescribe. Delega
// en `Entrega.aplicarEventoRepository` (mismo guard de orden que
// `marcarRepoBorrado`).
export async function renombrarRepoDeEntrega(
  entregaId: string,
  data: { repoName: string; repoUrl: string; eventoActualizadoEn?: Date },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  if (!entrega.aplicarEventoRepository(data, data.eventoActualizadoEn)) return;
  await entityManager.flush();
}

// El webhook de `member.added`/`member.removed` (issue #60): reconcilia el
// array denormalizado de colaboradores con acceso al repo. Delega en
// `Entrega.agregarColaborador`/`quitarColaborador` (comparación normalizada
// con `Alumno.normalizarUsername` — antes se comparaba a mano con
// `.toLowerCase()`, sin quitar el `@` inicial).
export async function actualizarColaboradoresDeEntrega(
  entregaId: string,
  data: { agregar?: string; quitar?: string },
  em?: EntityManager
): Promise<void> {
  const entityManager = em ?? (await getEM());
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  let cambio = false;
  if (data.agregar && entrega.agregarColaborador(data.agregar)) cambio = true;
  if (data.quitar && entrega.quitarColaborador(data.quitar)) cambio = true;
  if (cambio) await entityManager.flush();
}

export async function createEntrega(
  data: {
    assignmentId: string;
    repoName: string;
    repoUrl?: string;
    githubUsernames: string[];
    alumnoId?: string;
    grupoId?: string;
    // Id numérico de GitHub del repo (issue #60) — capturado al crear el
    // repo desde template (`crearEntrega` en `github.ts`), cuando está
    // disponible. Sin esto, el webhook depende exclusivamente del
    // "self-heal" del primer evento que llegue, lo que deja una ventana
    // real: dos renames del mismo repo entregados fuera de orden ANTES de
    // que cualquier webhook haya podido guardar el id se pierden.
    repoGithubId?: string;
    provisionEstado?: "pendiente" | "activa" | "fallida";
  },
  em?: EntityManager
): Promise<Entrega> {
  const entityManager = em ?? (await getEM());

  const assignment = await entityManager.findOneOrFail(Assignment, { id: data.assignmentId });

  const entrega = new Entrega();
  entrega.assignment = assignment;
  entrega.repoName = data.repoName;
  entrega.repoUrl = data.repoUrl;
  entrega.githubUsernames = data.githubUsernames;
  entrega.repoGithubId = data.repoGithubId;
  entrega.provisionEstado = data.provisionEstado ?? "activa";

  if (data.alumnoId) {
    entrega.alumno = entityManager.getReference(Alumno, data.alumnoId);
  }

  if (data.grupoId) {
    entrega.grupo = entityManager.getReference(Grupo, data.grupoId);
  }

  entityManager.persist(entrega);
  await entityManager.flush();
  return entrega;
}

const VENTANA_PROVISION_EN_VUELO_MS = 120_000;

// Reclama el aprovisionamiento bajo lock. Si otra request ya lo está
// ejecutando, devuelve null para que el segundo click observe la misma fila
// pendiente sin volver a crear el repo en GitHub. Un intento abandonado se
// puede reclamar de nuevo pasados dos minutos.
export async function iniciarProvisionEntrega(entregaId: string): Promise<Entrega | null> {
  const entityManager = await getEM();
  return entityManager.transactional(async (transaction) => {
    const entrega = await transaction.findOneOrFail(
      Entrega,
      { id: entregaId },
      {
        populate: ["assignment", "grupo", "alumno"],
        lockMode: LockMode.PESSIMISTIC_WRITE,
      }
    );
    if (entrega.hasRepo()) return entrega;
    const enVueloDesde = entrega.provisionActualizadoEn?.getTime();
    if (
      entrega.provisionEstado === "pendiente" &&
      entrega.provisionIntentos > 0 &&
      enVueloDesde !== undefined &&
      enVueloDesde > Date.now() - VENTANA_PROVISION_EN_VUELO_MS
    ) {
      return null;
    }
    entrega.iniciarProvision();
    await transaction.flush();
    return entrega;
  });
}

export async function marcarCreacionGithubIniciada(entregaId: string): Promise<Entrega> {
  const entityManager = await getEM();
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  entrega.marcarCreacionGithubIniciada();
  await entityManager.flush();
  return entrega;
}

export async function completarProvisionEntrega(
  entregaId: string,
  data: { repoName: string; repoUrl: string; repoGithubId?: string }
): Promise<Entrega> {
  const entityManager = await getEM();
  const entrega = await entityManager.findOneOrFail(
    Entrega,
    { id: entregaId },
    { populate: ["assignment", "grupo", "alumno"] }
  );
  entrega.completarProvision(data);
  await entityManager.flush();
  return entrega;
}

export async function fallarProvisionEntrega(entregaId: string, error: string): Promise<void> {
  const entityManager = await getEM();
  const entrega = await entityManager.findOneOrFail(Entrega, { id: entregaId });
  entrega.fallarProvision(error.slice(0, 2_000));
  await entityManager.flush();
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = extractDbErrorCode(error);
  return code === UNIQUE_VIOLATION || /unique constraint|duplicate key/i.test(error.message);
}

async function findExistingEntrega(
  data: {
    assignmentId: string;
    repoName: string;
    alumnoId?: string;
    grupoId?: string;
  },
  em?: EntityManager
): Promise<Entrega | null> {
  const entrega = await getEntregaByRepoName(data.repoName, em);
  if (entrega?.assignment?.id === data.assignmentId) return entrega;

  return getEntregaLogica(
    {
      assignmentId: data.assignmentId,
      alumnoId: data.alumnoId,
      grupoId: data.grupoId,
    },
    em
  );
}

export async function createOrGetEntrega(
  data: {
    assignmentId: string;
    repoName: string;
    repoUrl?: string;
    githubUsernames: string[];
    alumnoId?: string;
    grupoId?: string;
    repoGithubId?: string;
    provisionEstado?: "pendiente" | "activa" | "fallida";
  },
  em?: EntityManager
): Promise<Entrega> {
  const existing = await findExistingEntrega(data, em);
  if (existing) return existing;

  try {
    return await createEntrega(data, em);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const reconciled = await findExistingEntrega(data, em);
    if (reconciled) return reconciled;
    throw error;
  }
}

/**
 * Crea la entrega dentro de una transacción que primero bloquea el
 * assignment (mismo LockMode que cambiarEstadoAssignment) y vuelve a validar
 * que el estado siga habilitando la aceptación. Cierra la ventana entre el
 * chequeo inicial de aceptarAssignment (antes de las llamadas a GitHub, que
 * no pueden vivir dentro de una transacción de DB) y la persistencia final:
 * si un admin despublica el assignment mientras un alumno lo está aceptando,
 * quien llegue segundo a este lock ve el estado real y actúa en consecuencia.
 */
export async function crearEntregaSiAssignmentDisponible(
  data: {
    assignmentId: string;
    repoName: string;
    repoUrl?: string;
    githubUsernames: string[];
    alumnoId?: string;
    grupoId?: string;
    repoGithubId?: string;
    provisionEstado?: "pendiente" | "activa" | "fallida";
  },
  rol: RolDeUsuario
): Promise<Entrega> {
  const entityManager = await getEM();

  return entityManager.transactional(async (transaction) => {
    const assignment = await transaction.findOne(
      Assignment,
      { id: data.assignmentId },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    if (!rol.puedeAdministrar() && !assignment?.permiteAccionesDeAlumno()) {
      throw new AssignmentNoDisponibleError(data.assignmentId);
    }

    return createOrGetEntrega(data, transaction);
  });
}
