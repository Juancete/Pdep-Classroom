import { canalesActivos } from "@/infrastructure/canales";
import { intentarSincronizarGrupos } from "./intentarSincronizarGrupos";
import type { Comision } from "@/domain/entities";

export type ContextoAlumno = {
  githubUsername: string;
  email: string;
  comision: Comision;
};

export type ResultadoHooks = {
  canalesConError?: string[];
  gruposSync?: "ok" | "error";
};

export type HookPostConfirmacion = (ctx: ContextoAlumno) => Promise<ResultadoHooks>;

/**
 * Reconcilia la suscripción del alumno a cada canal de comunicación activo.
 * El `for` no ramifica por tipo de canal — cada uno sabe reconciliarse solo
 * (Template Method en `CanalDeComunicacion`). Un canal sin configurar ni
 * siquiera se invoca: `canalesActivos()` ya lo filtró.
 */
export const hookCanalesDeComunicacion: HookPostConfirmacion = async ({
  githubUsername,
}) => {
  const asuntosConError: string[] = [];
  for (const canal of canalesActivos()) {
    const resultado = await canal.sincronizar(githubUsername);
    if (resultado.estado === "error") {
      asuntosConError.push(canal.asuntoPendiente());
    }
  }
  return { canalesConError: asuntosConError };
};

/**
 * Sincroniza los grupos del alumno desde la planilla. El wrapper
 * `intentarSincronizarGrupos` ya loguea y marca el flag en DB para disparar el
 * retry automático en `/perfil`; acá sólo traducimos el throw a una respuesta
 * degradada para el warning inmediato.
 */
export const hookGruposSync: HookPostConfirmacion = async ({ githubUsername, comision }) => {
  if (comision.gruposYaImportados()) return { gruposSync: "ok" };
  try {
    await intentarSincronizarGrupos(githubUsername, comision);
    return { gruposSync: "ok" };
  } catch {
    return { gruposSync: "error" };
  }
};

/**
 * Corre la lista de hooks accesorios del origen y mergea sus resultados. Cada
 * hook es auto-contenido (corre, loguea, degrada); el runner no ramifica por
 * origen — cada flujo declara qué hooks corre vía la lista que pasa.
 */
export async function ejecutarHooksPostConfirmacion(
  ctx: ContextoAlumno,
  hooks: HookPostConfirmacion[]
): Promise<ResultadoHooks> {
  let resultado: ResultadoHooks = {};
  for (const hook of hooks) {
    resultado = { ...resultado, ...(await hook(ctx)) };
  }
  return resultado;
}

// Política por origen: qué hooks corre cada flujo del evento "alumno confirmado".
export const HOOKS_CONFIRMACION_ALUMNO: HookPostConfirmacion[] = [
  hookCanalesDeComunicacion,
  hookGruposSync,
];

// La importación admin suscribe a los canales pero NO sincroniza grupos
// inline: eso queda en la action dedicada `sincronizarGruposDeLaComision`
// (lectura única de la hoja, UI de progreso propia).
export const HOOKS_IMPORTACION_ALUMNO: HookPostConfirmacion[] = [
  hookCanalesDeComunicacion,
];
