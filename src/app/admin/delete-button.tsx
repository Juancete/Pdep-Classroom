"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(confirmMessage)) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${response.status}`);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
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
