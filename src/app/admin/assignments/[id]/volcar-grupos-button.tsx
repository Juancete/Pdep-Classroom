"use client";

import { FormularioDeAccion } from "@/components/FormularioDeAccion";
import { colLetter } from "@/lib/sheets-columns";
import type { VolcarGruposState } from "../actions";

export function VolcarGruposButton({
  assignmentId,
  columna,
  action,
}: {
  assignmentId: string;
  columna: number;
  // Recibida por prop desde el server component (`grupos/page.tsx`): ver el
  // comentario ahí sobre por qué este client component no importa la action
  // directamente (issue #90).
  action: (
    prevState: VolcarGruposState,
    formData: FormData
  ) => Promise<VolcarGruposState>;
}) {
  return (
    <FormularioDeAccion
      action={action}
      campos={{ assignmentId }}
      etiqueta={`Volcar grupos a la planilla (col. ${colLetter(columna)})`}
      etiquetaPendiente="Volcando…"
      resultado={(estado) => (
        <span
          className="text-xs font-medium text-green-700"
          title={estado.sinFila.length > 0 ? estado.sinFila.join(", ") : undefined}
        >
          {estado.alumnosEscritos} alumnos actualizados
          {estado.sinFila.length > 0 && (
            <span className="text-amber-600"> · {estado.sinFila.length} sin fila en la planilla</span>
          )}
        </span>
      )}
    />
  );
}
