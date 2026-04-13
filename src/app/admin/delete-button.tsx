"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteButton({
  confirmMessage,
  endpoint,
}: {
  confirmMessage: string;
  endpoint: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(confirmMessage)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
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
