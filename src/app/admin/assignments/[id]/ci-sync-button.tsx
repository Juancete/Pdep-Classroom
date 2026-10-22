"use client";

import { useRouter } from "next/navigation";
import { useSincronizacionDeCI } from "@/hooks/useSincronizacionDeCI";
import { RefreshIcon, SpinnerIcon } from "@/components/icons";
import { mensajeDeFallosDeSincronizacion } from "@/lib/ci-sync-mensajes";

// Encabezado de la tabla de entregas: fuerza la sincronización del estado de
// CI y de la participación por integrante (issue #122) contra GitHub. Sin
// auto-sync al montar (issue #60): el webhook de `check_suite` mantiene el
// CI al día en el momento en que corre, así que abrir la vista no necesita
// martillar la API — este botón queda como escape manual para cuando el
// webhook no llegó (delivery perdido, entorno sin webhook configurado, etc.)
// y como la única forma de refrescar la participación (issue #122: ningún
// webhook la actualiza).
export function CISyncButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { sincronizar: sincronizarCI, loading, mensaje } = useSincronizacionDeCI(
    assignmentId,
    { mensajeDeFallos: mensajeDeFallosDeSincronizacion }
  );

  async function sincronizar() {
    const resultado = await sincronizarCI();
    if (resultado && (resultado.actualizadas > 0 || resultado.participacion.actualizadas > 0)) {
      router.refresh();
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => sincronizar()}
        disabled={loading}
        title="Sincroniza CI y participación con GitHub"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-2.5 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? <SpinnerIcon className="w-4 h-4" /> : <RefreshIcon className="w-4 h-4" />}
        Actualizar
      </button>
      {mensaje && <span className="text-red-600 text-xs">{mensaje}</span>}
    </span>
  );
}
