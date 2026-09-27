"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { SyncState } from "./actions";

function SyncSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
    >
      {pending ? "Sincronizando…" : "Sincronizar"}
    </button>
  );
}

export function SyncButton({
  comisionId,
  action: sincronizarAlumnos,
}: {
  comisionId: string;
  // Recibida por prop desde el server component (`edit/page.tsx`): ver el
  // comentario ahí sobre por qué este client component no importa la action
  // directamente (issue #90).
  action: (prevState: SyncState, formData: FormData) => Promise<SyncState>;
}) {
  const [state, action] = useActionState<SyncState, FormData>(
    sincronizarAlumnos,
    { status: "idle" }
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="comisionId" value={comisionId} />
      <SyncSubmitButton />
      {state.status === "ok" && (
        <span className="text-xs text-green-600 font-medium">
          {state.sincronizados} sincronizados
          {state.conErrorDeGrupo > 0 && (
            <span className="text-amber-600"> · {state.conErrorDeGrupo} sin grupo</span>
          )}
        </span>
      )}
      {state.status === "error" && (
        <span className="text-xs text-red-600">{state.message}</span>
      )}
    </form>
  );
}
