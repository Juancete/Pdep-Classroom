"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";

export type GrupoAdminResumen = {
  id: string;
  nombre: string;
  maxIntegrantes: number;
  estaLleno: boolean;
  miembros: { username: string; nombreCompleto: string }[];
};

export type AlumnoSinGrupoResumen = {
  username: string;
  nombreCompleto: string;
};

export function GruposPanel({
  assignmentId,
  inscripcionesCerradas: initialCerradas,
  grupos,
  alumnosSinGrupo,
}: {
  assignmentId: string;
  inscripcionesCerradas: boolean;
  grupos: GrupoAdminResumen[];
  alumnosSinGrupo: AlumnoSinGrupoResumen[];
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [cerradas, setCerradas] = useState(initialCerradas);

  async function handleToggle() {
    await call(async () => {
      const res = await fetch(`/api/assignments/${assignmentId}/inscripciones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: !cerradas }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al cambiar el estado");
      }
      setCerradas((current) => !current);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
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

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold">Grupos ({grupos.length})</h2>
        </div>
        {grupos.length === 0 ? (
          <p className="text-sm text-gray-500 p-4">
            Todavía no hay grupos para este TP.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="grupos-list">
            {grupos.map((grupo) => (
              <li key={grupo.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{grupo.nombre}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      grupo.estaLleno
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {grupo.estaLleno
                      ? `Completo (${grupo.maxIntegrantes}/${grupo.maxIntegrantes})`
                      : `${grupo.miembros.length}/${grupo.maxIntegrantes}`}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {grupo.miembros.map((miembro) => (
                    <li key={miembro.username} className="text-xs text-gray-600">
                      {miembro.nombreCompleto}{" "}
                      <span className="text-gray-400">@{miembro.username}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {alumnosSinGrupo.length > 0 && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-lg p-4"
          data-testid="alumnos-sin-grupo"
        >
          <h2 className="text-sm font-semibold text-amber-800 mb-2">
            Sin grupo ({alumnosSinGrupo.length})
          </h2>
          <ul className="space-y-0.5">
            {alumnosSinGrupo.map((alumno) => (
              <li key={alumno.username} className="text-xs text-amber-700">
                {alumno.nombreCompleto}{" "}
                <span className="text-amber-500">@{alumno.username}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
