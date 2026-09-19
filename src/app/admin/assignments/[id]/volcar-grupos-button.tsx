"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { colLetter } from "@/lib/sheets-columns";
import { volcarGruposALaPlanilla, type VolcarGruposState } from "../actions";

function VolcarSubmitButton({ columna }: { columna: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
    >
      {pending ? "Volcando…" : `Volcar grupos a la planilla (col. ${colLetter(columna)})`}
    </button>
  );
}

export function VolcarGruposButton({
  assignmentId,
  columna,
}: {
  assignmentId: string;
  columna: number;
}) {
  const [state, action] = useActionState<VolcarGruposState, FormData>(
    volcarGruposALaPlanilla,
    { status: "idle" }
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <VolcarSubmitButton columna={columna} />
      {state.status === "ok" && (
        <span
          className="text-xs font-medium text-green-700"
          title={state.sinFila.length > 0 ? state.sinFila.join(", ") : undefined}
        >
          {state.alumnosEscritos} alumnos actualizados
          {state.sinFila.length > 0 && (
            <span className="text-amber-600"> · {state.sinFila.length} sin fila en la planilla</span>
          )}
        </span>
      )}
      {state.status === "error" && (
        <span className="text-xs text-red-600">{state.message}</span>
      )}
    </form>
  );
}
