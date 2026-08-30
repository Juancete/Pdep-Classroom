import type { Alumno } from "@/domain/entities";
import { canalesActivos, type CanalDeComunicacion } from "@/lib/canales";
import { getSuscripcionesDeAlumno } from "@/lib/repositories";
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
    suscripciones.filter((suscripcion) => suscripcion.estaPendiente()).map((suscripcion) => suscripcion.canal)
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
