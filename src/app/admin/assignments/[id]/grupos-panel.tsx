"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";
import { ACCIONES, confirmacionPara } from "../../grupo-acciones";
import { GrupoCard } from "../../grupo-card";
import type { GrupoAdminResumen } from "../../grupo-resumen";

export type AlumnoSinGrupoResumen = {
  username: string;
  nombreCompleto: string;
};

export function GruposPanel({
  assignmentId,
  grupos,
  alumnosSinGrupo,
}: {
  assignmentId: string;
  grupos: GrupoAdminResumen[];
  alumnosSinGrupo: AlumnoSinGrupoResumen[];
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [destinoPorAlumno, setDestinoPorAlumno] = useState<Record<string, string>>({});

  async function handleAgregar(username: string) {
    const grupoDestinoId = destinoPorAlumno[username];
    if (!grupoDestinoId) return;
    const grupoDestino = grupos.find((grupo) => grupo.id === grupoDestinoId);
    if (!grupoDestino || !confirm(confirmacionPara("agregar", grupoDestino))) return;

    await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupoDestinoId}/miembros/${username}`,
        { method: "PUT" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al agregar al alumno al grupo");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 mt-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

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
                <GrupoCard assignmentId={assignmentId} grupo={grupo} conAcciones />
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
          <ul className="space-y-1.5">
            {alumnosSinGrupo.map((alumno) => {
              const gruposConCupo = grupos.filter(
                (grupo) => !grupo.estaLleno && grupo.tipoDeIntegrantes === "alumnos"
              );
              return (
                <li
                  key={alumno.username}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-700"
                >
                  <span>
                    {alumno.nombreCompleto}{" "}
                    <span className="text-amber-500">@{alumno.username}</span>
                  </span>
                  {gruposConCupo.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={destinoPorAlumno[alumno.username] ?? ""}
                        onChange={(event) =>
                          setDestinoPorAlumno((current) => ({
                            ...current,
                            [alumno.username]: event.target.value,
                          }))
                        }
                        disabled={loading}
                        aria-label={`Agregar a @${alumno.username} a…`}
                        className="text-xs border border-amber-300 rounded px-1.5 py-1 disabled:opacity-50"
                      >
                        <option value="">Agregar a…</option>
                        {gruposConCupo.map((grupo) => (
                          <option key={grupo.id} value={grupo.id}>
                            {grupo.nombre}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAgregar(alumno.username)}
                        disabled={loading || !destinoPorAlumno[alumno.username]}
                        className={`font-medium disabled:opacity-40 disabled:cursor-not-allowed ${ACCIONES.agregar.className}`}
                      >
                        {ACCIONES.agregar.etiquetaBoton}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
