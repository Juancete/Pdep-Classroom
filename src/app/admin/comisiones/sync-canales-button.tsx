"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  sincronizarCanalesDeLaComision,
  type SyncCanalesState,
} from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
    >
      {pending ? "Reintentando…" : "Reintentar suscripciones"}
    </button>
  );
}

export function SyncCanalesButton({
  comisionId,
}: {
  comisionId: string;
}) {
  const [state, action] = useActionState<SyncCanalesState, FormData>(
    sincronizarCanalesDeLaComision,
    { status: "idle" }
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="comisionId" value={comisionId} />
      <SubmitButton />
      {state.status === "ok" && (
        <span className="text-xs font-medium text-green-700">
          {state.sincronizados} sincronizados
          {state.omitidos > 0 && (
            <span className="text-gray-500"> · {state.omitidos} omitidos</span>
          )}
          {state.aunConError > 0 && (
            <span className="text-red-600">
              {" "}
              · {state.aunConError} aún con error
            </span>
          )}
        </span>
      )}
      {state.status === "error" && (
        <span className="text-xs text-red-600">{state.message}</span>
      )}
    </form>
  );
}
