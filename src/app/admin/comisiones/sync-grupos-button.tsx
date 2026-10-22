"use client";

import { FormularioDeAccion } from "@/components/FormularioDeAccion";
import type { SyncGruposState } from "./actions";

export function SyncGruposButton({
  comisionId,
  action,
}: {
  comisionId: string;
  // Recibida por prop desde el server component (`edit/page.tsx`): ver el
  // comentario ahí sobre por qué este client component no importa la action
  // directamente (issue #90).
  action: (
    prevState: SyncGruposState,
    formData: FormData
  ) => Promise<SyncGruposState>;
}) {
  return (
    <FormularioDeAccion
      action={action}
      campos={{ comisionId }}
      etiqueta="Importar grupos desde Sheets"
      etiquetaPendiente="Importando…"
      resultado={(estado) => (
        <span className="text-xs font-medium text-green-700">
          {estado.sincronizados} resueltos
          {estado.aunConError > 0 && (
            <span className="text-red-600"> · {estado.aunConError} aún con error</span>
          )}
        </span>
      )}
    />
  );
}
