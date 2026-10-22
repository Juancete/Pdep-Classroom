"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApiCall } from "@/hooks/useApiCall";
import { pedirJson } from "@/lib/pedir-json";
import { contadorDeErroresSinLeer } from "@/components/layout/contador-de-errores-sin-leer";

function useMutationFeedback() {
  const router = useRouter();
  const { loading: pending, error, call } = useApiCall();
  const [exito, setExito] = useState<string | null>(null);

  const run = async (operation: () => Promise<string>) => {
    if (pending) return;
    setExito(null);
    const message = await call(operation);
    if (message === undefined) return;
    setExito(message);
    void contadorDeErroresSinLeer.refrescar();
    router.refresh();
  };
  return { pending, error, exito, run };
}

function FeedbackMessage({ error, exito }: { error: string | null; exito: string | null }) {
  const message = error ?? exito;
  if (!message) return null;
  return (
    <span
      role={error ? "alert" : "status"}
      aria-live="polite"
      className={error ? "text-sm text-red-700" : "text-sm text-green-700"}
    >
      {message}
    </span>
  );
}

export function AcknowledgeErrorButton({ id }: { id: string }) {
  const { pending, error, exito, run } = useMutationFeedback();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => void run(async () => {
          await pedirJson(`/api/admin/errores/${id}`, { method: "PATCH" });
          return "Error marcado como leído";
        })}
        className="text-sm font-medium text-pdep-600 hover:text-pdep-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Marcando…" : "Marcar como leído"}
      </button>
      <FeedbackMessage error={error} exito={exito} />
    </div>
  );
}

export function ErrorLogBulkActions({ unread }: { unread: number }) {
  const acknowledge = useMutationFeedback();
  const purge = useMutationFeedback();

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={unread === 0 || acknowledge.pending}
          onClick={() => void acknowledge.run(async () => {
            const data = await pedirJson<{ acknowledged?: number }>("/api/admin/errores/acknowledge-all", { method: "POST" });
            return `${Number(data.acknowledged ?? 0)} errores marcados como leídos`;
          })}
          className="rounded-lg bg-pdep-600 px-4 py-2 text-sm font-medium text-white hover:bg-pdep-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {acknowledge.pending ? "Marcando…" : "Marcar todos como leídos"}
        </button>
        <FeedbackMessage error={acknowledge.error} exito={acknowledge.exito} />
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={purge.pending}
          onClick={() => {
            if (!window.confirm("Se eliminarán únicamente errores leídos cuya última aparición tenga más de 90 días. ¿Continuar?")) return;
            void purge.run(async () => {
              const data = await pedirJson<{ deleted?: number }>("/api/admin/errores/purge", { method: "POST" });
              const deleted = Number(data.deleted ?? 0);
              return deleted === 0
                ? "No había errores antiguos para purgar"
                : `${deleted} errores antiguos eliminados`;
            });
          }}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {purge.pending ? "Purgando…" : "Purgar antiguos"}
        </button>
        <FeedbackMessage error={purge.error} exito={purge.exito} />
      </div>
    </div>
  );
}
