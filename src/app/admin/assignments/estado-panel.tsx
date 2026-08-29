"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EstadoAssignmentBadge } from "@/app/components/EstadoAssignmentBadge";
import { SpinnerIcon } from "@/app/components/icons";
import { ACCIONES_ESTADO } from "./estado-acciones";
import { useTransicionDeEstado } from "./useTransicionDeEstado";
import type { NombreEstadoAssignment } from "@/types";

function formatearFechaAuditoria(fecha: string): string {
  return new Date(fecha).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function EstadoPanel({
  assignmentId,
  estado: initialEstado,
  accionesDisponibles,
  motivoBloqueoBorrador,
  publicadoEn,
  publicadoPor,
  archivadoEn,
  archivadoPor,
}: {
  assignmentId: string;
  estado: NombreEstadoAssignment;
  accionesDisponibles: NombreEstadoAssignment[];
  // Calculado en el server page con `EstadoAssignment.motivoDeBloqueo` — el
  // panel es cliente y no puede tirar el error de dominio él mismo para
  // leer el mensaje (Fase 3 de la auditoría de dominio). `null` si volver a
  // borrador está permitido (o no aplica, ej. ya está en borrador).
  motivoBloqueoBorrador: string | null;
  publicadoEn: string | null;
  publicadoPor: string | null;
  archivadoEn: string | null;
  archivadoPor: string | null;
}) {
  const router = useRouter();
  const { transicionar, loading, error } = useTransicionDeEstado(assignmentId);
  // router.refresh() vuelve a ejecutar el Server Component padre, pero como
  // este panel ya está montado, useState no resincroniza solo con las props
  // nuevas. En vez de un efecto que dispare un setState extra (cascading
  // render), el padre monta este componente con `key={estado}`: cuando el
  // estado real cambia, React lo remonta con las props frescas del servidor
  // en vez de arrastrar el estado local viejo.
  const [estado, setEstado] = useState(initialEstado);
  const [acciones, setAcciones] = useState(accionesDisponibles);

  async function handleTransicion(destino: NombreEstadoAssignment) {
    if (!confirm(ACCIONES_ESTADO[destino].confirmacion)) return;

    const nuevoEstado = await transicionar(destino);
    if (nuevoEstado) {
      // Transición inmediata para feedback instantáneo; el efecto de arriba
      // la reemplaza por los valores reales en cuanto router.refresh() trae
      // las props actualizadas del servidor.
      setEstado(nuevoEstado);
      setAcciones([]);
      router.refresh();
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500">Estado:</span>
          <EstadoAssignmentBadge estado={estado} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {acciones.map((destino) => {
            const { etiquetaBoton, className, Icon } = ACCIONES_ESTADO[destino];
            return (
              <button
                key={destino}
                onClick={() => handleTransicion(destino)}
                disabled={loading}
                data-testid={`accion-${destino}`}
                className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
              >
                {loading ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                {etiquetaBoton}
              </button>
            );
          })}
          {motivoBloqueoBorrador && (
            <span className="text-xs text-gray-500">{motivoBloqueoBorrador}</span>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {(publicadoEn || archivadoEn) && (
        <p className="text-xs text-gray-400 mt-3">
          {publicadoEn && (
            <>
              Publicado el {formatearFechaAuditoria(publicadoEn)}
              {publicadoPor ? ` por @${publicadoPor}` : ""}
            </>
          )}
          {publicadoEn && archivadoEn && " — "}
          {archivadoEn && (
            <>
              Archivado el {formatearFechaAuditoria(archivadoEn)}
              {archivadoPor ? ` por @${archivadoPor}` : ""}
            </>
          )}
        </p>
      )}
    </div>
  );
}
