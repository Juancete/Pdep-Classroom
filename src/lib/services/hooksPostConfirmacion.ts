import type { AgregarMiembroResult } from "@/lib/googleGroups";
import { intentarSincronizarGrupos } from "./intentarSincronizarGrupos";
import { intentarSincronizarGoogleGroup } from "./intentarSincronizarGoogleGroup";
import type { Comision } from "@/domain/entities";

export type ContextoAlumno = {
  githubUsername: string;
  email: string;
  comision: Comision;
};

export type ResultadoHooks = {
  groupSubscription?: AgregarMiembroResult["status"];
  gruposSync?: "ok" | "error";
};

export type HookPostConfirmacion = (ctx: ContextoAlumno) => Promise<ResultadoHooks>;

/**
 * Reconcilia la membresía persistente del alumno. El servicio obtiene email y
 * estado desde DB para que la misma operación sirva también en los reintentos.
 */
export const hookGoogleGroups: HookPostConfirmacion = async ({
  githubUsername,
}) => {
  const suscripcion = await intentarSincronizarGoogleGroup(githubUsername);
  return { groupSubscription: suscripcion.status };
};

/**
 * Sincroniza los grupos del alumno desde la planilla. El wrapper
 * `intentarSincronizarGrupos` ya loguea y marca el flag en DB para disparar el
 * retry automático en `/perfil`; acá sólo traducimos el throw a una respuesta
 * degradada para el warning inmediato.
 */
export const hookGruposSync: HookPostConfirmacion = async ({ githubUsername, comision }) => {
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
  hookGoogleGroups,
  hookGruposSync,
];

// La importación admin suscribe al grupo pero NO sincroniza grupos inline: eso
// queda en la action dedicada `sincronizarGruposDeLaComision` (lectura única de
// la hoja, UI de progreso propia).
export const HOOKS_IMPORTACION_ALUMNO: HookPostConfirmacion[] = [hookGoogleGroups];
