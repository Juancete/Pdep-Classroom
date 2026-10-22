"use client";

import { useState } from "react";
import { useApiCall } from "@/hooks/useApiCall";
import { pedirJson } from "@/lib/pedir-json";
import type { RespuestaDeSincronizacion } from "@/lib/ci-sync-mensajes";

// Fuerza la sincronización del CI de un assignment contra GitHub
// (`POST /api/assignments/:id/ci`). Compartido por el botón del dashboard del
// alumno y el del admin: cada uno decide con `mensajeDeFallos` qué advertencia
// mostrar y cuándo hacer `router.refresh()` con el resultado devuelto.
export function useSincronizacionDeCI(
  assignmentId: string,
  {
    mensajeDeFallos,
  }: { mensajeDeFallos: (resultado: RespuestaDeSincronizacion) => string | null }
) {
  const { loading, error, call } = useApiCall();
  const [advertencia, setAdvertencia] = useState<string | null>(null);

  async function sincronizar(): Promise<RespuestaDeSincronizacion | undefined> {
    setAdvertencia(null);
    const resultado = await call(() =>
      pedirJson<RespuestaDeSincronizacion>(`/api/assignments/${assignmentId}/ci`, {
        method: "POST",
        json: { forzar: true },
      })
    );
    if (resultado) setAdvertencia(mensajeDeFallos(resultado));
    return resultado;
  }

  return { sincronizar, loading, mensaje: error ?? advertencia };
}
