"use client";

import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";
import { RefreshIcon, SpinnerIcon } from "@/app/components/icons";
import type { SincronizarCIResult } from "@/lib/services/sincronizarCI";

// Botón chico del dashboard del alumno: sincroniza sólo su propia entrega.
// Sin auto-refresh al montar (a diferencia del admin) — evitar multiplicar
// llamadas a GitHub por cantidad de alumnos × assignments visibles.
export function CIRefreshButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();

  async function handleRefresh() {
    const resultado = await call(async () => {
      const response = await fetch(`/api/assignments/${assignmentId}/ci`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forzar: true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${response.status}`);
      }
      return (await response.json()) as SincronizarCIResult;
    });
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
      {error && <span className="text-red-600 text-[11px]">{error}</span>}
    </span>
  );
}
