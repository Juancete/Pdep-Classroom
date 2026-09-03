import type { NombreDeCanal } from "@/domain/entities";
import { CanalDeComunicacion } from "./CanalDeComunicacion";
import { GoogleGroupsCanal } from "./GoogleGroupsCanal";

export {
  CanalDeComunicacion,
  type ResultadoDeAlta,
  type ResultadoDeBaja,
  type ResultadoDeSincronizacion,
} from "./CanalDeComunicacion";
export { GoogleGroupsCanal } from "./GoogleGroupsCanal";

// Instancias singleton sin estado propio (mismo criterio que
// DOCENTE/ESTUDIANTE en RolDeUsuario.ts). Agregar un canal nuevo es sumarlo
// acá + a NOMBRES_DE_CANAL en SuscripcionAlumno.ts + una migración que
// ensanche el CHECK de la columna `canal` — ver README, sección "Canales de
// comunicación".
export const CANALES_DE_COMUNICACION: readonly CanalDeComunicacion[] = [
  new GoogleGroupsCanal(),
];

/**
 * Canales con las variables de entorno completas. `estaConfigurado()` lee
 * env en cada llamada — no cachear este resultado, puede cambiar entre
 * requests (o entre tests).
 */
export function canalesActivos(): CanalDeComunicacion[] {
  return CANALES_DE_COMUNICACION.filter((canal) => canal.estaConfigurado());
}

export function canalPorNombre(nombre: NombreDeCanal): CanalDeComunicacion | undefined {
  return CANALES_DE_COMUNICACION.find((canal) => canal.nombre === nombre);
}
