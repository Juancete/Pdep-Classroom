"use client";

import { FormularioDeAccion } from "@/components/FormularioDeAccion";
import type { SyncCanalesState } from "./actions";

export function SyncCanalesButton({
  comisionId,
  action,
}: {
  comisionId: string;
  // Recibida por prop desde el server component (`edit/page.tsx`): ver el
  // comentario ahí sobre por qué este client component no importa la action
  // directamente (issue #90).
  action: (
    prevState: SyncCanalesState,
    formData: FormData
  ) => Promise<SyncCanalesState>;
}) {
  return (
    <FormularioDeAccion
      action={action}
      campos={{ comisionId }}
      etiqueta="Reintentar suscripciones"
      etiquetaPendiente="Reintentando…"
      resultado={(estado) => (
        <span className="text-xs font-medium text-green-700">
          {estado.sincronizados} sincronizados
          {estado.omitidos > 0 && (
            <span className="text-gray-500"> · {estado.omitidos} omitidos</span>
          )}
          {estado.aunConError > 0 && (
            <span className="text-red-600">
              {" "}
              · {estado.aunConError} aún con error
            </span>
          )}
        </span>
      )}
    />
  );
}
