"use client";

import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";

// Botón para borrar una entrega puntual desde admin (issue #107) — mismo
// idioma que `CIRerunButton`: `useApiCall`, confirm() previo con el nombre
// del repo, `router.refresh()` al terminar. Estilo de texto igual al
// `ACCIONES.quitar` de `grupos-panel.tsx` (rojo, sin fondo).
export function BorrarEntregaButton({
  assignmentId,
  entregaId,
  repoName,
}: {
  assignmentId: string;
  entregaId: string;
  repoName?: string;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();

  async function handleBorrar() {
    const destino = repoName ?? "esta entrega sin repo";
    if (!confirm(`¿Seguro que querés borrar ${destino}? Esta acción no se puede deshacer.`)) {
      return;
    }

    const ok = await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/entregas/${entregaId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${response.status}`);
      }
      return true;
    });
    if (ok) router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        onClick={handleBorrar}
        disabled={loading}
        className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Borrar
      </button>
      {error && <span className="text-red-600 text-[11px]">{error}</span>}
    </span>
  );
}
