import {
  agregarMiembroAGrupo,
  quitarMiembroDeGrupo,
  type AgregarMiembroResult,
} from "@/lib/googleGroups";
import { intentarSincronizarGrupos } from "./intentarSincronizarGrupos";
import { logger } from "@/lib/logger";
import { Alumno, type Comision } from "@/domain/entities";

/**
 * Contexto del evento "alumno confirmado/actualizado". `emailPrevio` es el email
 * que el alumno tenía en la DB antes de esta confirmación; se usa para des-suscribir
 * del Google Group la dirección vieja cuando el email cambió. En un alta nueva
 * (registro de un alumno inexistente) o en la importación no hay previo, así que
 * sólo se suscribe la dirección actual.
 */
export type ContextoAlumno = {
  githubUsername: string;
  email: string;
  comision: Comision;
  emailPrevio?: string;
};

export type ResultadoHooks = {
  groupSubscription?: AgregarMiembroResult["status"];
  gruposSync?: "ok" | "error";
};

export type HookPostConfirmacion = (ctx: ContextoAlumno) => Promise<ResultadoHooks>;

// Enmascara la parte local del email para no escupir PII a los logs,
// preservando dominio y primeras 2 letras para que un admin pueda
// reconocer al alumno (combinado con el githubUsername del log).
function maskEmail(correo: string): string {
  return correo.replace(/^([^@]{1,2})([^@]*)(@.+)$/, "$1xxxxxx$3");
}

// Enmascara cualquier email embebido en un texto libre (p. ej. el `message` de
// un error de googleapis, que suele citar el email del miembro afectado).
function maskEmailsEnTexto(texto: string): string {
  return texto.replace(/([\w.+-]{1,2})([\w.+-]*)(@[\w.-]+\.\w+)/g, "$1xxxxxx$3");
}

/**
 * Suscribe al alumno al Google Group con su email actual y, si el email cambió
 * respecto al previo, des-suscribe la dirección vieja sólo cuando el alta nueva
 * quedó asegurada. La baja es best-effort: se loguea pero no degrada la
 * respuesta. El status devuelto refleja la suscripción del email actual, no la
 * baja del viejo.
 */
export const hookGoogleGroups: HookPostConfirmacion = async ({
  githubUsername,
  email,
  emailPrevio,
}) => {
  const suscripcion = await agregarMiembroAGrupo(email);
  if (suscripcion.status === "error") {
    logger.error(
      {
        githubUsername,
        maskedEmail: maskEmail(email),
        err: maskEmailsEnTexto(suscripcion.error),
      },
      "Error al suscribir al Google Group"
    );
  }

  const puedeQuitarEmailPrevio =
    suscripcion.status === "added" || suscripcion.status === "already_member";
  if (
    puedeQuitarEmailPrevio &&
    emailPrevio &&
    Alumno.normalizarEmail(emailPrevio) !== Alumno.normalizarEmail(email)
  ) {
    const baja = await quitarMiembroDeGrupo(emailPrevio);
    if (baja.status === "error") {
      logger.error(
        {
          githubUsername,
          maskedEmail: maskEmail(emailPrevio),
          err: maskEmailsEnTexto(baja.error),
        },
        "Error al des-suscribir el email anterior del Google Group"
      );
    }
  }

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
