"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ERROR_LOGS_CHANGED_EVENT } from "@/components/layout/use-error-log-count";

type Feedback = { type: "success" | "error"; message: string } | null;

async function mutate(url: string, method: "PATCH" | "POST") {
  const response = await fetch(url, { method });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "No se pudo completar la operación";
    throw new Error(message);
  }
  return data as Record<string, unknown>;
}

function useMutationFeedback() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = async (operation: () => Promise<string>) => {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const message = await operation();
      setFeedback({ type: "success", message });
      window.dispatchEvent(new Event(ERROR_LOGS_CHANGED_EVENT));
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo completar la operación",
      });
    } finally {
      setPending(false);
    }
  };
  return { pending, feedback, run };
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <span
      role={feedback.type === "error" ? "alert" : "status"}
      aria-live="polite"
      className={feedback.type === "error" ? "text-sm text-red-700" : "text-sm text-green-700"}
    >
      {feedback.message}
    </span>
  );
}

export function AcknowledgeErrorButton({ id }: { id: string }) {
  const { pending, feedback, run } = useMutationFeedback();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => void run(async () => {
          await mutate(`/api/admin/errores/${id}`, "PATCH");
          return "Error marcado como leído";
        })}
        className="text-sm font-medium text-pdep-600 hover:text-pdep-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Marcando…" : "Marcar como leído"}
      </button>
      <FeedbackMessage feedback={feedback} />
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
            const data = await mutate("/api/admin/errores/acknowledge-all", "POST");
            return `${Number(data.acknowledged ?? 0)} errores marcados como leídos`;
          })}
          className="rounded-lg bg-pdep-600 px-4 py-2 text-sm font-medium text-white hover:bg-pdep-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {acknowledge.pending ? "Marcando…" : "Marcar todos como leídos"}
        </button>
        <FeedbackMessage feedback={acknowledge.feedback} />
      </div>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={purge.pending}
          onClick={() => {
            if (!window.confirm("Se eliminarán únicamente errores leídos cuya última aparición tenga más de 90 días. ¿Continuar?")) return;
            void purge.run(async () => {
              const data = await mutate("/api/admin/errores/purge", "POST");
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
        <FeedbackMessage feedback={purge.feedback} />
      </div>
    </div>
  );
}
