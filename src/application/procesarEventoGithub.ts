import { z } from "zod";
import { ORG, esColaborador, getRepoInfoPorId } from "@/infrastructure/github";
import { sincronizarCIDeEntregas } from "./sincronizarCI";
import {
  getEntregaByRepoName,
  getEntregaPorRepoGithubId,
  asegurarRepoGithubId,
  getAlumnoByGithub,
  conLockDeEntrega,
  actualizarActividadDeEntrega,
  marcarRepoBorrado,
  renombrarRepoDeEntrega,
  actualizarColaboradoresDeEntrega,
} from "@/infrastructure/repositories";
import type { Entrega } from "@/domain/entities";

// `entregaId` viaja junto al estado para que `recibirWebhookGithub` la deje
// escrita en la fila de auditoría del delivery — se resuelve acá porque acá
// es donde se sabe a qué entrega correspondía el repo del payload.
export type ResultadoProceso = {
  estado: "procesado" | "ignorado";
  entregaId?: string;
};

const IGNORADO: ResultadoProceso = { estado: "ignorado" };

const SHA_CERO = "0000000000000000000000000000000000000000";

// Forma mínima que comparten los cuatro eventos suscriptos — sólo lo que
// hace falta para el chequeo de alcance (issue #60: "validar que
// organización y repositorio pertenezcan al alcance configurado") y para
// resolver la entrega dueña sin depender sólo del nombre.
const RepositorySchema = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
  html_url: z.string().optional(),
  // Id numérico de GitHub del repo — no cambia con un rename, a diferencia
  // de `name`. Se usa para resolver la entrega de forma robusta al orden de
  // entrega de los webhooks (ver `resolverEntrega` más abajo).
  id: z.union([z.number(), z.string()]).optional(),
  // Sólo lo usan `push` (como `pushed_at`) y `repository` (como
  // `updated_at`) — GitHub los actualiza en cada operación relevante, a
  // diferencia de `head_commit.timestamp` (fecha de autoría del commit, no
  // de cuándo se pusheó). En el payload de webhook viajan como epoch en
  // segundos, a diferencia de la REST API normal, que usa ISO 8601.
  pushed_at: z.union([z.number(), z.string()]).optional(),
  updated_at: z.union([z.number(), z.string()]).optional(),
});

const PayloadBaseSchema = z.object({ repository: RepositorySchema });

const CheckSuiteSchema = z.object({
  action: z.string(),
  repository: RepositorySchema,
});

const PushSchema = z.object({
  deleted: z.boolean().optional(),
  after: z.string().optional(),
  sender: z.object({ login: z.string() }).optional(),
  repository: RepositorySchema,
});

// Interpreta un epoch (segundos) o un string ISO. Devuelve `null` si no se
// pudo interpretar (en vez de una fecha por default) — cada caller decide
// qué hacer ante la ausencia: `push` rechaza el evento (issue #60, un
// timestamp de orden ausente reabriría el problema que vino a resolver),
// `repository` lo trata como "sin señal de orden" y aplica igual.
function fechaDeEpochGithub(valor: number | string | undefined): Date | null {
  if (typeof valor === "number") {
    const parsed = new Date(valor * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof valor === "string") {
    const parsed = new Date(valor);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

const RepositoryEventSchema = z.object({
  action: z.string(),
  repository: RepositorySchema,
  changes: z
    .object({ repository: z.object({ name: z.object({ from: z.string() }) }) })
    .optional(),
});

const MemberSchema = z.object({
  action: z.string(),
  member: z.object({ login: z.string() }),
  repository: RepositorySchema,
});

function idComoString(id: number | string | undefined): string | undefined {
  return id === undefined ? undefined : String(id);
}

/**
 * Resuelve la entrega dueña de un repo. Si el payload trae `repository.id`,
 * se prueba primero por ahí — no cambia con un rename, a diferencia del
 * nombre — y recién si no hay match (todavía no se conoce ese id, ej. el
 * primer webhook que llega para una entrega nueva) se cae al lookup por
 * nombre. Autocompleta (`self-heal`) `repoGithubId` la primera vez que se
 * conoce, en cualquier evento — no sólo en `repository` — así que para
 * cuando llegue un `deleted`/`renamed` ya suele estar disponible.
 *
 * El fallback por nombre rechaza una entrega cuyo `repoGithubId` YA está
 * seteado a un id distinto del que trae el evento: un repo borrado y
 * recreado con el mismo nombre es un repo distinto (otro `id` de GitHub) —
 * sin este chequeo, los eventos del repo nuevo terminarían aplicándose
 * sobre la entrega vieja sólo porque el nombre coincide.
 */
async function resolverEntrega(data: {
  repoName: string;
  repoGithubId?: string;
}): Promise<Entrega | null> {
  if (data.repoGithubId) {
    const porId = await getEntregaPorRepoGithubId(data.repoGithubId);
    if (porId) return porId;
  }

  const porNombre = await getEntregaByRepoName(data.repoName);
  if (!porNombre) return null;

  if (
    data.repoGithubId &&
    porNombre.repoGithubId &&
    porNombre.repoGithubId !== data.repoGithubId
  ) {
    return null;
  }

  if (data.repoGithubId && !porNombre.repoGithubId) {
    await asegurarRepoGithubId(porNombre.id, data.repoGithubId);
  }
  return porNombre;
}

// Resuelve la entrega dueña del repo y aplica `effect` sólo si existe — un
// repo que no corresponde a ninguna entrega (template, repo de la app
// misma, etc.) se ignora de forma segura sin que cada handler repita el
// lookup. El `entregaId` queda en el resultado incluso si `effect` termina
// ignorando el evento (ej. un `member.added` de alguien que no es alumno) —
// sirve igual para la auditoría del delivery.
async function conEntregaDelRepo(
  data: { repoName: string; repoGithubId?: string },
  effect: (entrega: Entrega) => Promise<"procesado" | "ignorado">
): Promise<ResultadoProceso> {
  const entrega = await resolverEntrega(data);
  if (!entrega) return IGNORADO;
  const estado = await effect(entrega);
  return { estado, entregaId: entrega.id };
}

// `check_suite` en vez de `workflow_run`: entra con el permiso `Checks` que
// la App ya tiene (no hace falta `Actions`), y evita confiar en la
// conclusión de una sola suite del payload — un repo puede tener más de un
// workflow. Se relee el estado combinado con `getEstadoCI` (vía
// `sincronizarCIDeEntregas`, forzando el caché) y se reusa
// `resultadoDesdeCheckRuns` tal cual la dejó #58. El webhook acá es
// "invalidar y refrescar", no "confiar en el payload".
async function manejarCheckSuite(payload: unknown): Promise<ResultadoProceso> {
  const parsed = CheckSuiteSchema.safeParse(payload);
  if (!parsed.success) return IGNORADO;
  const { action, repository } = parsed.data;
  if (action !== "requested" && action !== "rerequested" && action !== "completed") {
    return IGNORADO;
  }

  return conEntregaDelRepo(
    { repoName: repository.name, repoGithubId: idComoString(repository.id) },
    (entrega) =>
      conLockDeEntrega(entrega.id, async (transaction) => {
        const resultado = await sincronizarCIDeEntregas([entrega], {
          forzar: true,
          em: transaction,
        });
        if (resultado.fallidas.length > 0) {
          throw new Error(resultado.fallidas[0]!.error);
        }
        return "procesado" as const;
      })
  );
}

async function manejarPush(payload: unknown): Promise<ResultadoProceso> {
  const parsed = PushSchema.safeParse(payload);
  if (!parsed.success) return IGNORADO;
  const { deleted, after, sender, repository } = parsed.data;
  // Ignora el borrado de un branch (`deleted: true`) y el push "vacío" que
  // GitHub manda con `after` en ceros en ese mismo caso.
  if (deleted || !after || after === SHA_CERO || !sender) return IGNORADO;

  // La fecha de "actividad reciente" es `repository.pushed_at` — lo que
  // GitHub actualiza en cada push — no la hora en que NOSOTROS procesamos el
  // evento ni `head_commit.timestamp` (fecha de autoría del commit, no de
  // cuándo se pusheó). GitHub no garantiza el orden de entrega de webhooks:
  // si usáramos la hora de procesamiento, un push viejo que llega después de
  // uno nuevo pisaría el SHA correcto sólo por haber sido procesado último.
  //
  // Sin `pushed_at` interpretable no hay señal de orden confiable — caer a
  // `new Date()` acá reabriría exactamente ese problema (un push viejo
  // demorado ganaría por procesarse último). Ante ese caso se tira, así el
  // delivery queda `fallido` (visible, reprocesable) en vez de aplicarse en
  // silencio con una fecha que no significa lo que dice significar.
  const pusheadoEn = fechaDeEpochGithub(repository.pushed_at);
  if (!pusheadoEn) {
    throw new Error(
      `El payload de push para "${repository.name}" no trae repository.pushed_at interpretable`
    );
  }

  return conEntregaDelRepo(
    { repoName: repository.name, repoGithubId: idComoString(repository.id) },
    (entrega) =>
      conLockDeEntrega(entrega.id, async (transaction) => {
        await actualizarActividadDeEntrega(
          entrega.id,
          {
            pusheadoEn,
            commitSha: after,
            por: sender.login,
          },
          transaction
        );
        return "procesado" as const;
      })
  );
}

async function manejarRepository(payload: unknown): Promise<ResultadoProceso> {
  const parsed = RepositoryEventSchema.safeParse(payload);
  if (!parsed.success) return IGNORADO;
  const { action, repository, changes } = parsed.data;
  const repoGithubId = idComoString(repository.id);
  // Sin señal de orden (payload sin `updated_at`), se aplica igual — mismo
  // criterio defensivo que otros campos opcionales del payload.
  const eventoActualizadoEn = fechaDeEpochGithub(repository.updated_at) ?? undefined;

  if (action === "deleted") {
    return conEntregaDelRepo({ repoName: repository.name, repoGithubId }, async (entrega) =>
      conLockDeEntrega(entrega.id, async (transaction) => {
        await marcarRepoBorrado(entrega.id, eventoActualizadoEn, transaction);
        return "procesado" as const;
      })
    );
  }

  if (action === "renamed") {
    const nombreAnterior = changes?.repository.name.from;
    // El payload de un `renamed` llega con el nombre NUEVO en
    // `repository.name` — si no se conoce el `repoGithubId` todavía, la
    // entrega sigue guardada con el nombre viejo, así que sin
    // `changes.repository.name.from` no hay forma de encontrarla por
    // nombre. Con `repoGithubId` ya conocido, `resolverEntrega` la
    // encuentra sin necesitar el nombre viejo en absoluto — por eso este
    // guard sólo corta cuando además no hay id.
    if (!nombreAnterior && !repoGithubId) return IGNORADO;

    // Reconciliar el nombre/URL actuales contra GitHub (por id) en vez de
    // confiar en el payload: dos `renamed` del mismo repo con el mismo
    // `updated_at` (resolución de un segundo) pueden procesarse en el orden
    // inverso al real, y con el dato crudo del payload el que se procese
    // último "gana" aunque sea el más viejo. Consultando el estado actual,
    // cualquiera de los dos que se procese escribe el mismo nombre
    // verdadero. Sin `repoGithubId` (payload defensivo sin `id`) se cae al
    // dato del propio payload, que es lo único disponible.
    const actual = repoGithubId ? await getRepoInfoPorId(repoGithubId) : null;
    const repoNameFinal = actual?.repoName ?? repository.name;
    const repoUrlFinal =
      actual?.repoUrl ?? repository.html_url ?? `https://github.com/${ORG}/${repository.name}`;

    return conEntregaDelRepo(
      { repoName: nombreAnterior ?? repository.name, repoGithubId },
      (entrega) =>
        conLockDeEntrega(entrega.id, async (transaction) => {
          await renombrarRepoDeEntrega(
            entrega.id,
            {
              repoName: repoNameFinal,
              repoUrl: repoUrlFinal,
              eventoActualizadoEn,
            },
            transaction
          );
          return "procesado" as const;
        })
    );
  }

  // `created`, `archived`, `publicized`, etc. — sin efecto en Classroom hoy.
  return IGNORADO;
}

async function manejarMember(payload: unknown): Promise<ResultadoProceso> {
  const parsed = MemberSchema.safeParse(payload);
  if (!parsed.success) return IGNORADO;
  const { action, member, repository } = parsed.data;
  if (action !== "added" && action !== "removed") return IGNORADO;

  // `action` sólo decide si el evento es de los que nos interesan — el
  // efecto se reconcilia contra el estado real de GitHub ("¿es colaborador
  // ahora mismo?"), no se aplica el delta del payload tal cual. GitHub no
  // garantiza orden de entrega: un `removed` que llega después de un
  // `added` más reciente (o viceversa) dejaría el array desincronizado si
  // sólo aplicáramos la acción — reconciliar converge a la verdad sin
  // importar el orden de llegada (mismo criterio que `check_suite`:
  // invalidar y refrescar, no confiar en el payload). Todo bajo lock de la
  // entrega porque `actualizarColaboradoresDeEntrega` hace un
  // read-modify-write del array completo — sin serializar, dos eventos
  // simultáneos podrían leer el mismo array viejo y pisarse entre sí.
  return conEntregaDelRepo(
    { repoName: repository.name, repoGithubId: idComoString(repository.id) },
    (entrega) =>
      conLockDeEntrega(entrega.id, async (transaction) => {
        const esColaboradorAhora = await esColaborador(repository.name, member.login);

        if (esColaboradorAhora) {
          // Sólo se agrega si GitHub reporta a un alumno conocido — sin este
          // guard, agregar a un docente como colaborador lo metería en la
          // grilla de entregas y en el filtro de búsqueda.
          const alumno = await getAlumnoByGithub(member.login, false, transaction);
          if (!alumno) return "ignorado" as const;
          await actualizarColaboradoresDeEntrega(
            entrega.id,
            { agregar: member.login },
            transaction
          );
          return "procesado" as const;
        }

        await actualizarColaboradoresDeEntrega(
          entrega.id,
          { quitar: member.login },
          transaction
        );
        return "procesado" as const;
      })
  );
}

type ManejadorDeEvento = (payload: unknown) => Promise<ResultadoProceso>;

// Tabla evento → handler, no una cadena de ifs — mismo criterio que
// `RESULTADOS_POR_NOMBRE` en `ResultadoCI.ts`. Un evento sin entrada acá se
// ignora de forma segura: es justamente "eventos desconocidos se ignoran".
const MANEJADORES: Record<string, ManejadorDeEvento> = {
  check_suite: manejarCheckSuite,
  push: manejarPush,
  repository: manejarRepository,
  member: manejarMember,
};

/**
 * Aplica el efecto de un evento de webhook de GitHub ya deduplicado y
 * persistido (ver `recibirDeliveryDeGithub`). Valida forma mínima y
 * alcance (org configurada) antes de delegar al handler del evento.
 */
export async function procesarEventoGithub(
  evento: string,
  payload: unknown
): Promise<ResultadoProceso> {
  const parsed = PayloadBaseSchema.safeParse(payload);
  if (!parsed.success) return IGNORADO;
  if (parsed.data.repository.owner.login.toLowerCase() !== ORG.toLowerCase()) {
    return IGNORADO;
  }

  const manejador = MANEJADORES[evento];
  if (!manejador) return IGNORADO;
  return manejador(payload);
}
