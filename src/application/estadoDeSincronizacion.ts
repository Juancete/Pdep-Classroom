import { cache } from "react";
import type { Alumno } from "@/domain/entities";
import { getCurrentUser } from "@/infrastructure/auth/session";
import { canalesActivos, type CanalDeComunicacion } from "@/infrastructure/canales";
import { getAlumnoByGithub, getSuscripcionesDeAlumno } from "@/infrastructure/repositories";
import { enumerar } from "@/lib/naming";

export type EstadoDeSincronizacion = {
  hayPendientes: boolean;
  mensaje: string;
  canalesPendientes: CanalDeComunicacion[];
};

/**
 * Combina los asuntos de sincronización propios del alumno (planilla, grupo
 * de TP) con los de sus canales de comunicación activos y pendientes, en un
 * único mensaje enumerado. Reemplaza la cadena de `if` que antes armaba el
 * mensaje a mano combinación por combinación — acá cada feature aporta su
 * frase y no hay ramificación por tipo.
 */
export async function resolverEstadoDeSincronizacion(
  alumno: Alumno
): Promise<EstadoDeSincronizacion> {
  const activos = canalesActivos();
  const suscripciones = await getSuscripcionesDeAlumno(
    alumno.id,
    activos.map((canal) => canal.nombre)
  );
  const canalesConSuscripcionPendiente = new Set(
    alumno.suscripcionesPendientes(suscripciones).map((suscripcion) => suscripcion.canal)
  );
  const canalesPendientes = activos.filter((canal) =>
    canalesConSuscripcionPendiente.has(canal.nombre)
  );

  const asuntos = [
    ...alumno.asuntosDeSyncPendientes(),
    ...canalesPendientes.map((canal) => canal.asuntoPendiente()),
  ];

  return {
    hayPendientes: asuntos.length > 0,
    mensaje: asuntos.length > 0 ? `No pudimos ${enumerar(asuntos)}.` : "",
    canalesPendientes,
  };
}

/**
 * Estado de sincronización del usuario logueado, o `null` si no aplica (sin
 * sesión, rol que no ve el banner, alumno todavía sin registrar o fallo al
 * leerlo — el layout no debe romperse por esto). `cache()` lo comparte entre
 * el nav y el banner dentro de una misma request: una sola consulta.
 */
export const estadoDeSincronizacionDelUsuarioActual = cache(
  async (): Promise<EstadoDeSincronizacion | null> => {
    const user = await getCurrentUser();
    if (!user || !user.rol.veBannerDeSincronizacion()) return null;

    const alumno = await getAlumnoByGithub(user.githubUsername).catch(() => null);
    if (!alumno) return null;

    return resolverEstadoDeSincronizacion(alumno);
  }
);
