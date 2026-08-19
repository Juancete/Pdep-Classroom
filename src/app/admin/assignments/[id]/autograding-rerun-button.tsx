"use client";

import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";
import { PlayIcon, SpinnerIcon } from "@/app/components/icons";

// Botón ícono-solo para pedir el rerun de la última ejecución de autograding
// de una entrega — mismo idioma que `EstadoQuickActions`: `useApiCall`,
// confirm() previo, `router.refresh()` al terminar.
export function AutogradingRerunButton({
  assignmentId,
  entregaId,
  permiteReejecucion,
}: {
  assignmentId: string;
  entregaId: string;
  permiteReejecucion: boolean;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();

  async function handleRerun() {
    if (!confirm("¿Reejecutar el autograding de esta entrega?")) return;

    const ok = await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/autograding/rerun`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entregaId }),
        }
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
    <span className="inline-flex items-center gap-1">
      <button
        onClick={handleRerun}
        disabled={loading || !permiteReejecucion}
        title={
          permiteReejecucion
            ? "Reejecutar autograding"
            : "No hay una ejecución previa para reejecutar"
        }
        aria-label="Reejecutar autograding"
        className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
      >
        {loading ? <SpinnerIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
      </button>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </span>
  );
}
