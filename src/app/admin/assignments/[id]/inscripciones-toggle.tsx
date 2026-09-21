"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";

export function InscripcionesToggle({
  assignmentId,
  cerradas: initialCerradas,
}: {
  assignmentId: string;
  cerradas: boolean;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [cerradas, setCerradas] = useState(initialCerradas);

  async function handleToggle() {
    await call(async () => {
      const response = await fetch(`/api/assignments/${assignmentId}/inscripciones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: !cerradas }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al cambiar el estado");
      }
      setCerradas((current) => !current);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Inscripciones a grupos</h2>
          <p className="text-sm text-gray-500 mt-1">
            {cerradas
              ? "Cerradas — los alumnos no pueden crear ni unirse a grupos."
              : "Abiertas — los alumnos pueden crear y unirse a grupos."}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          data-testid="toggle-inscripciones"
          className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            cerradas
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-amber-600 text-white hover:bg-amber-700"
          }`}
        >
          {cerradas ? "Abrir inscripciones" : "Cerrar inscripciones"}
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 mt-3">{error}</p>
      )}
    </div>
  );
}
