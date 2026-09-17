"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";
import { RefreshIcon, SpinnerIcon } from "@/components/icons";
import { mensajeDeFallosDeCI } from "@/lib/ci-sync-mensajes";
import type { SincronizarCIResult } from "@/application/sincronizarCI";

// Encabezado de la tabla de entregas: fuerza la sincronización del estado de
// CI contra GitHub. Sin auto-sync al montar (issue #60): el webhook de
// `check_suite` mantiene el estado al día en el momento en que corre CI, así
// que abrir la vista no necesita martillar la API — este botón queda como
// escape manual para cuando el webhook no llegó (delivery perdido, entorno
// sin webhook configurado, etc.).
export function CISyncButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [advertencia, setAdvertencia] = useState<string | null>(null);

  async function sincronizar() {
    setAdvertencia(null);
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
    if (resultado) setAdvertencia(mensajeDeFallosDeCI(resultado));
    if (resultado && resultado.actualizadas > 0) router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => sincronizar()}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-md px-2.5 py-1.5 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? <SpinnerIcon className="w-4 h-4" /> : <RefreshIcon className="w-4 h-4" />}
        Actualizar CI
      </button>
      {(error ?? advertencia) && (
        <span className="text-red-600 text-xs">{error ?? advertencia}</span>
      )}
    </span>
  );
}
