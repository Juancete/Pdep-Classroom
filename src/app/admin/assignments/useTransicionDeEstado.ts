"use client";

import { useApiCall } from "@/hooks/useApiCall";
import type { NombreEstadoAssignment } from "@/types";

// Llamada al PATCH de transición, compartida entre `EstadoPanel` y
// `EstadoQuickActions` — un solo lugar que arma el fetch y traduce el error
// del servidor, para que ambos componentes se comporten igual.
export function useTransicionDeEstado(assignmentId: string) {
  const { loading, error, call } = useApiCall();

  async function transicionar(
    destino: NombreEstadoAssignment
  ): Promise<NombreEstadoAssignment | undefined> {
    const resultado = await call(async () => {
      const response = await fetch(`/api/assignments/${assignmentId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: destino }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${response.status}`);
      }
      return (await response.json()) as { estado: NombreEstadoAssignment };
    });
    return resultado?.estado;
  }

  return { transicionar, loading, error };
}
