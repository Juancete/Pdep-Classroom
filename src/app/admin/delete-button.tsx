"use client";

import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";
import { pedirJson } from "@/lib/pedir-json";
import { TrashIcon, SpinnerIcon } from "@/components/icons";

export function DeleteButton({
  confirmMessage,
  endpoint,
  compact = false,
}: {
  confirmMessage: string;
  endpoint: string;
  /** Ícono solo (tacho), sin el texto "Eliminar" — para filas angostas de tabla. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();

  async function handleDelete() {
    if (!confirm(confirmMessage)) return;
    await call(async () => {
      await pedirJson(endpoint, { method: "DELETE" });
      router.refresh();
    });
  }

  if (compact) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button
          onClick={handleDelete}
          disabled={loading}
          title="Eliminar"
          aria-label="Eliminar"
          className="inline-flex items-center justify-center p-1.5 rounded-md text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {loading ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
        </button>
        {error && <span className="text-red-600 text-xs">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50"
      >
        {loading ? "Eliminando…" : "Eliminar"}
      </button>
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </span>
  );
}
