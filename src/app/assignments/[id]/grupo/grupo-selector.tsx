"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";
import type { GrupoResumen } from "./mi-grupo";

export function GrupoSelector({
  assignmentId,
  grupos,
  inscripcionesCerradas,
}: {
  assignmentId: string;
  grupos: GrupoResumen[];
  inscripcionesCerradas: boolean;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [nombreNuevoGrupo, setNombreNuevoGrupo] = useState("");
  const [grupoJoiningId, setGrupoJoiningId] = useState<string | null>(null);

  async function handleCrear(event: React.FormEvent) {
    event.preventDefault();
    await call(async () => {
      const res = await fetch(`/api/assignments/${assignmentId}/grupos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreNuevoGrupo }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al crear el grupo");
      }
      router.refresh();
    });
  }

  async function handleUnirse(grupoId: string) {
    setGrupoJoiningId(grupoId);
    await call(async () => {
      const res = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupoId}/join`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al unirse al grupo");
      }
      router.refresh();
    });
    setGrupoJoiningId(null);
  }

  if (inscripcionesCerradas) {
    return (
      <div
        className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center"
        data-testid="inscripciones-cerradas"
      >
        <p className="text-yellow-800 font-medium">
          Las inscripciones están cerradas
        </p>
        <p className="text-yellow-700 text-sm mt-1">
          Contactá a tu docente para que te asigne un grupo.
        </p>
      </div>
    );
  }

  const gruposAbiertos = grupos.filter((grupo) => !grupo.estaLleno);

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <section>
        <h2 className="text-base font-semibold mb-3">Crear un grupo nuevo</h2>
        <form onSubmit={handleCrear} className="flex gap-2">
          <input
            type="text"
            value={nombreNuevoGrupo}
            onChange={(event) => setNombreNuevoGrupo(event.target.value)}
            placeholder="Nombre del grupo"
            disabled={loading}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pdep-500 disabled:opacity-50"
            aria-label="Nombre del grupo"
          />
          <button
            type="submit"
            disabled={loading || !nombreNuevoGrupo.trim()}
            className="text-sm bg-pdep-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-pdep-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && !grupoJoiningId ? "Creando…" : "Crear"}
          </button>
        </form>
      </section>

      {gruposAbiertos.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">
            Grupos con cupo disponible
          </h2>
          <ul className="space-y-2">
            {gruposAbiertos.map((grupo) => (
              <li
                key={grupo.id}
                className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-sm">{grupo.nombre}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {grupo.miembros.join(", ")} —{" "}
                    {grupo.miembros.length}/{grupo.maxIntegrantes} integrantes
                  </p>
                </div>
                <button
                  onClick={() => handleUnirse(grupo.id)}
                  disabled={loading}
                  className="text-sm bg-white border border-pdep-600 text-pdep-600 px-4 py-1.5 rounded-lg font-medium hover:bg-pdep-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {grupoJoiningId === grupo.id ? "Uniéndose…" : "Unirme"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {grupos.length > 0 && gruposAbiertos.length === 0 && (
        <p className="text-sm text-gray-500">
          Todos los grupos están completos. Creá uno nuevo.
        </p>
      )}
    </div>
  );
}
