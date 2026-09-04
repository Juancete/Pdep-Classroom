"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";

export type GrupoDisponible = { id: string; nombre: string };

// Config por acción: texto del botón y estilo — dato, no rama de lógica.
// Mismo idioma que `estado-panel.tsx` para las acciones de ciclo de vida.
const ACCIONES: Record<
  "salir" | "cambiar",
  { etiquetaBoton: string; confirmacion: string; className: string }
> = {
  salir: {
    etiquetaBoton: "Salir del grupo",
    confirmacion: "¿Seguro que querés salir del grupo?",
    className:
      "bg-white border border-red-300 text-red-700 hover:bg-red-50",
  },
  cambiar: {
    etiquetaBoton: "Cambiarme de grupo",
    confirmacion: "¿Seguro que querés cambiarte de grupo?",
    className:
      "bg-white border border-pdep-600 text-pdep-600 hover:bg-pdep-50",
  },
};

export function AccionesDeMembresia({
  assignmentId,
  grupoId,
  githubUsername,
  motivoBloqueo,
  esUltimoMiembro,
  gruposDisponibles,
}: {
  assignmentId: string;
  grupoId: string;
  githubUsername: string;
  // Sondeado en el servidor con el mismo objeto que va a rechazar el
  // request si igual se manda: el texto acá ES el `message` del error.
  motivoBloqueo: string | null;
  esUltimoMiembro: boolean;
  gruposDisponibles: GrupoDisponible[];
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [grupoDestinoId, setGrupoDestinoId] = useState("");

  // Los botones se muestran siempre, deshabilitados con el motivo visible —
  // no un `return` temprano como grupo-selector.tsx con inscripciones
  // cerradas: acá el criterio de aceptación pide explicar por qué la acción
  // está bloqueada, no ocultarla.
  const bloqueado = motivoBloqueo !== null;

  async function handleSalir() {
    const confirmacion = esUltimoMiembro
      ? `${ACCIONES.salir.confirmacion} Sos el último integrante: el grupo se va a eliminar y su nombre queda libre.`
      : ACCIONES.salir.confirmacion;
    if (!confirm(confirmacion)) return;

    await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupoId}/miembros/${githubUsername}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al salir del grupo");
      }
      router.refresh();
    });
  }

  async function handleCambiar() {
    if (!grupoDestinoId) return;
    if (!confirm(ACCIONES.cambiar.confirmacion)) return;

    await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupoDestinoId}/miembros/${githubUsername}`,
        { method: "PUT" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al cambiar de grupo");
      }
      router.refresh();
    });
  }

  return (
    <div className="pt-2 border-t border-gray-100 space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {bloqueado && (
        <p className="text-xs text-gray-400" data-testid="membresia-bloqueada">
          {motivoBloqueo}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSalir}
          disabled={loading || bloqueado}
          className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${ACCIONES.salir.className}`}
        >
          {ACCIONES.salir.etiquetaBoton}
        </button>

        {gruposDisponibles.length > 0 && (
          <>
            <select
              value={grupoDestinoId}
              onChange={(event) => setGrupoDestinoId(event.target.value)}
              disabled={loading || bloqueado}
              aria-label="Elegir grupo destino"
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 disabled:opacity-50"
            >
              <option value="">Elegir grupo…</option>
              {gruposDisponibles.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCambiar}
              disabled={loading || bloqueado || !grupoDestinoId}
              className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${ACCIONES.cambiar.className}`}
            >
              {ACCIONES.cambiar.etiquetaBoton}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
