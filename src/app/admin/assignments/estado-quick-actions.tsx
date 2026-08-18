"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SpinnerIcon } from "@/app/components/icons";
import { ACCIONES_ESTADO } from "./estado-acciones";
import { useTransicionDeEstado } from "./useTransicionDeEstado";
import type { NombreEstadoAssignment } from "@/types";

// Versión compacta (solo ícono) de las transiciones de estado, para usar en
// la grilla — mismas etiquetas, confirmaciones y endpoint que `EstadoPanel`,
// vía `ACCIONES_ESTADO`/`useTransicionDeEstado` compartidos.
export function EstadoQuickActions({
  assignmentId,
  accionesDisponibles,
}: {
  assignmentId: string;
  accionesDisponibles: NombreEstadoAssignment[];
}) {
  const router = useRouter();
  const { transicionar, loading, error } = useTransicionDeEstado(assignmentId);
  const [acciones, setAcciones] = useState(accionesDisponibles);

  async function handleTransicion(destino: NombreEstadoAssignment) {
    if (!confirm(ACCIONES_ESTADO[destino].confirmacion)) return;

    const nuevoEstado = await transicionar(destino);
    if (nuevoEstado) {
      setAcciones([]);
      router.refresh();
    }
  }

  if (acciones.length === 0 && !error) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {acciones.map((destino) => {
        const { etiquetaBoton, Icon } = ACCIONES_ESTADO[destino];
        return (
          <button
            key={destino}
            onClick={() => handleTransicion(destino)}
            disabled={loading}
            title={etiquetaBoton}
            aria-label={etiquetaBoton}
            data-testid={`quick-accion-${destino}`}
            className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
          </button>
        );
      })}
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </span>
  );
}
