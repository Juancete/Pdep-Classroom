"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReprocessWebhookButton({ deliveryId }: { deliveryId?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reprocess() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/webhooks/github/reprocesar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deliveryId ? { deliveryId } : {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo reprocesar");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={reprocess}
        disabled={pending}
        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 disabled:opacity-50"
      >
        {pending ? "Reprocesando…" : deliveryId ? "Reprocesar" : "Reprocesar pendientes"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
