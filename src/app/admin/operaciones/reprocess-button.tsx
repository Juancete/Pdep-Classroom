"use client";

import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";
import { pedirJson } from "@/lib/pedir-json";

export function ReprocessWebhookButton({ deliveryId }: { deliveryId?: string }) {
  const router = useRouter();
  const { loading: pending, error, call } = useApiCall();

  async function reprocess() {
    await call(async () => {
      await pedirJson("/api/webhooks/github/reprocesar", {
        method: "POST",
        json: deliveryId ? { deliveryId } : {},
      });
      router.refresh();
    });
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
