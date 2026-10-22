"use client";

import { useRouter } from "next/navigation";
import { useSincronizacionDeCI } from "@/hooks/useSincronizacionDeCI";
import { RefreshIcon, SpinnerIcon } from "@/components/icons";
import { mensajeDeFallosDeCI } from "@/lib/ci-sync-mensajes";

// Botón chico del dashboard del alumno: sincroniza sólo su propia entrega.
// Sin auto-refresh al montar (a diferencia del admin) — evitar multiplicar
// llamadas a GitHub por cantidad de alumnos × assignments visibles.
export function CIRefreshButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { sincronizar, loading, mensaje } = useSincronizacionDeCI(assignmentId, {
    mensajeDeFallos: mensajeDeFallosDeCI,
  });

  async function handleRefresh() {
    const resultado = await sincronizar();
    if (resultado) router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={handleRefresh}
        disabled={loading}
        title="Actualizar estado de CI"
        aria-label="Actualizar estado de CI"
        className="inline-flex items-center justify-center p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        {loading ? <SpinnerIcon className="w-3.5 h-3.5" /> : <RefreshIcon className="w-3.5 h-3.5" />}
      </button>
      {mensaje && <span className="text-red-600 text-[11px]">{mensaje}</span>}
    </span>
  );
}
