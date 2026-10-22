"use client";

import { FormularioDeAccion } from "@/components/FormularioDeAccion";
import type { SyncState } from "./actions";

export function SyncButton({
  comisionId,
  action,
}: {
  comisionId: string;
  // Recibida por prop desde el server component (`edit/page.tsx`): ver el
  // comentario ahí sobre por qué este client component no importa la action
  // directamente (issue #90).
  action: (prevState: SyncState, formData: FormData) => Promise<SyncState>;
}) {
  return (
    <FormularioDeAccion
      action={action}
      campos={{ comisionId }}
      etiqueta="Sincronizar"
      etiquetaPendiente="Sincronizando…"
      resultado={(estado) => (
        <span className="text-xs text-green-600 font-medium">
          {estado.sincronizados} sincronizados
          {estado.conErrorDeGrupo > 0 && (
            <span className="text-amber-600"> · {estado.conErrorDeGrupo} sin grupo</span>
          )}
        </span>
      )}
    />
  );
}
