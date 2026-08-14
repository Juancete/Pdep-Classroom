"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";
import { EstadoAssignmentBadge } from "@/app/components/EstadoAssignmentBadge";
import type { NombreEstadoAssignment } from "@/types";

// Config por acción: texto del botón, consecuencia explicada en el confirm()
// y estilo — dato, no rama de lógica. El destino habilitado por estado ya
// llega calculado desde el servidor (`transicionesDisponibles`).
const ACCIONES: Record<
  NombreEstadoAssignment,
  { etiquetaBoton: string; confirmacion: string; className: string }
> = {
  borrador: {
    etiquetaBoton: "Volver a borrador",
    confirmacion:
      "El TP deja de estar visible para los alumnos. Solo se puede porque todavía no tiene entregas.",
    className: "bg-gray-600 text-white hover:bg-gray-700",
  },
  publicado: {
    etiquetaBoton: "Publicar",
    confirmacion:
      "El TP va a quedar visible para los alumnos de la comisión, que van a poder aceptarlo y crear sus repos.",
    className: "bg-green-600 text-white hover:bg-green-700",
  },
  archivado: {
    etiquetaBoton: "Archivar",
    confirmacion:
      "Los alumnos sin entrega dejan de ver el TP. Los que ya entregaron lo siguen viendo, archivado, con acceso a su repo. No se borran repos ni entregas. Una vez archivado, ya no se puede despublicar.",
    className: "bg-amber-600 text-white hover:bg-amber-700",
  },
};

function formatearFechaAuditoria(fecha: string): string {
  return new Date(fecha).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function EstadoPanel({
  assignmentId,
  estado: initialEstado,
  accionesDisponibles,
  entregasCount,
  publicadoEn,
  publicadoPor,
  archivadoEn,
  archivadoPor,
}: {
  assignmentId: string;
  estado: NombreEstadoAssignment;
  accionesDisponibles: NombreEstadoAssignment[];
  entregasCount: number;
  publicadoEn: string | null;
  publicadoPor: string | null;
  archivadoEn: string | null;
  archivadoPor: string | null;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  // router.refresh() vuelve a ejecutar el Server Component padre, pero como
  // este panel ya está montado, useState no resincroniza solo con las props
  // nuevas. En vez de un efecto que dispare un setState extra (cascading
  // render), el padre monta este componente con `key={estado}`: cuando el
  // estado real cambia, React lo remonta con las props frescas del servidor
  // en vez de arrastrar el estado local viejo.
  const [estado, setEstado] = useState(initialEstado);
  const [acciones, setAcciones] = useState(accionesDisponibles);

  async function handleTransicion(destino: NombreEstadoAssignment) {
    if (!confirm(ACCIONES[destino].confirmacion)) return;

    const resultado = await call(async () => {
      const response = await fetch(`/api/assignments/${assignmentId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: destino }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${response.status}`);
      }
      return (await response.json()) as { estado: NombreEstadoAssignment };
    });

    if (resultado) {
      // Transición inmediata para feedback instantáneo; el efecto de arriba
      // la reemplaza por los valores reales en cuanto router.refresh() trae
      // las props actualizadas del servidor.
      setEstado(resultado.estado);
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
          {acciones.map((destino) => (
            <button
              key={destino}
              onClick={() => handleTransicion(destino)}
              disabled={loading}
              data-testid={`accion-${destino}`}
              className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${ACCIONES[destino].className}`}
            >
              {ACCIONES[destino].etiquetaBoton}
            </button>
          ))}
          {estado === "publicado" && !acciones.includes("borrador") && (
            <span className="text-xs text-gray-500">
              Con entregas ({entregasCount}) solo se puede archivar.
            </span>
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
