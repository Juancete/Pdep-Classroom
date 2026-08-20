"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";
import { RefreshIcon, SpinnerIcon } from "@/app/components/icons";
import type { SincronizarCIResult } from "@/lib/services/sincronizarCI";

// Encabezado de la tabla de entregas: dispara la sincronización del estado
// de CI contra GitHub. Al montar, sincroniza sin forzar (respeta la ventana
// de frescura del caché, así abrir la vista no martilla la API si ya se
// consultó hace poco); el botón fuerza el lote completo.
export function CISyncButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const yaSincronizoAlMontar = useRef(false);

  async function sincronizar(forzar: boolean) {
    const resultado = await call(async () => {
      const response = await fetch(`/api/assignments/${assignmentId}/ci`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forzar }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${response.status}`);
      }
      return (await response.json()) as SincronizarCIResult;
    });
    if (resultado && resultado.actualizadas > 0) router.refresh();
  }

  useEffect(() => {
    if (yaSincronizoAlMontar.current) return;
    yaSincronizoAlMontar.current = true;
    void sincronizar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => sincronizar(true)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-2.5 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? <SpinnerIcon className="w-4 h-4" /> : <RefreshIcon className="w-4 h-4" />}
        Actualizar CI
      </button>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </span>
  );
}
