"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Forma común de los estados que devuelven las server actions de admin
// (`SyncState`, `SyncGruposState`, `SyncCanalesState`, `VolcarGruposState`):
// cada una agrega sus propios contadores al caso `ok`.
export type EstadoDeAccion<Resultado extends object = object> =
  | { status: "idle" }
  | { status: "error"; message: string }
  | ({ status: "ok" } & Resultado);

function BotonDeEnvio({
  etiqueta,
  etiquetaPendiente,
}: {
  etiqueta: string;
  etiquetaPendiente: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
    >
      {pending ? etiquetaPendiente : etiqueta}
    </button>
  );
}

// Formulario de un solo botón que dispara una server action y muestra su
// resultado. La action llega por prop desde el server component (issue #90):
// este client component no la importa directamente.
export function FormularioDeAccion<Estado extends EstadoDeAccion>({
  action,
  campos,
  etiqueta,
  etiquetaPendiente,
  resultado,
  className = "flex items-center gap-2",
}: {
  action: (estadoPrevio: Estado, formData: FormData) => Promise<Estado>;
  /** Campos ocultos del formulario (nombre → valor). */
  campos: Record<string, string>;
  etiqueta: string;
  etiquetaPendiente: string;
  /** Render del caso `ok`; el `idle` y el `error` los resuelve el componente. */
  resultado: (estado: Extract<Estado, { status: "ok" }>) => ReactNode;
  className?: string;
}) {
  const [estado, ejecutar] = useActionState<Estado, FormData>(action, {
    status: "idle",
  } as Awaited<Estado>);

  return (
    <form action={ejecutar} className={className}>
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <BotonDeEnvio etiqueta={etiqueta} etiquetaPendiente={etiquetaPendiente} />
      {estado.status === "ok" && resultado(estado as Extract<Estado, { status: "ok" }>)}
      {estado.status === "error" && (
        <span className="text-xs text-red-600">{estado.message}</span>
      )}
    </form>
  );
}
