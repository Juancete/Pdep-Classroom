"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";
import { CIBadge } from "@/components/CIBadge";
import { RepoDeEntrega } from "@/components/RepoDeEntrega";
import {
  ACCIONES,
  advertenciaEntregaDestino,
  confirmacionPara,
  type AlumnoAfectado,
} from "./grupo-acciones";
import type { GrupoAdminResumen } from "./grupo-resumen";

export function GrupoCard({
  assignmentId,
  grupo,
  conAcciones,
}: {
  assignmentId: string;
  grupo: GrupoAdminResumen;
  conAcciones: boolean;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [destinoPorMiembro, setDestinoPorMiembro] = useState<Record<string, string>>({});

  async function handleQuitar(miembro: AlumnoAfectado) {
    if (!confirm(confirmacionPara("quitar", grupo, miembro))) return;

    await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupo.id}/miembros/${miembro.username}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al quitar al alumno del grupo");
      }
      router.refresh();
    });
  }

  async function handleMover(miembro: AlumnoAfectado) {
    const grupoDestinoId = destinoPorMiembro[miembro.username];
    if (!grupoDestinoId) return;
    const grupoDestino = grupo.destinos.find((destino) => destino.id === grupoDestinoId);
    if (!grupoDestino) return;
    const confirmacion = [
      confirmacionPara("mover", grupo, miembro, grupoDestino),
      advertenciaEntregaDestino(grupoDestino),
    ]
      .filter(Boolean)
      .join(" ");
    if (!confirm(confirmacion)) return;

    await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupoDestinoId}/miembros/${miembro.username}`,
        { method: "PUT" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al mover al alumno de grupo");
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="font-medium text-sm">{grupo.nombre}</span>
        <div className="flex flex-wrap items-center gap-2">
          {grupo.paradigma && (
            <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full">
              {grupo.paradigma}
            </span>
          )}
          {grupo.tipoDeIntegrantes === "docentes" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              Docentes
            </span>
          )}
          {grupo.entrega && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
              Repo creado
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              grupo.estaLleno ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
            }`}
          >
            {grupo.etiquetaCupo}
          </span>
        </div>
      </div>
      {grupo.assignmentTitulo && (
        <p className="text-xs text-gray-400 mb-2">{grupo.assignmentTitulo}</p>
      )}
      {grupo.entrega && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <RepoDeEntrega estadoRepo={grupo.entrega.estadoRepo} repoUrl={grupo.entrega.repoUrl} />
          {grupo.entrega.ci && (
            <CIBadge
              resultadoNombre={grupo.entrega.ci.resultadoNombre}
              detalleUrl={grupo.entrega.ci.detalleUrl}
            />
          )}
          {grupo.entrega.ultimoPush && (
            <span className="text-gray-400 text-[11px]">
              Último push: {grupo.entrega.ultimoPush.fecha} ({grupo.entrega.ultimoPush.por})
            </span>
          )}
        </div>
      )}
      <ul className="space-y-1.5">
        {grupo.miembros.map((miembro) => (
          <li
            key={miembro.username}
            className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600"
          >
            <span>
              {miembro.nombreCompleto}{" "}
              <span className="text-gray-400">@{miembro.username}</span>
            </span>
            {conAcciones && (
            <div className="flex items-center gap-1.5">
              {grupo.destinos.length > 0 && (
                <>
                  <select
                    value={destinoPorMiembro[miembro.username] ?? ""}
                    onChange={(event) =>
                      setDestinoPorMiembro((current) => ({
                        ...current,
                        [miembro.username]: event.target.value,
                      }))
                    }
                    disabled={loading}
                    aria-label={`Mover a @${miembro.username} a…`}
                    className="text-xs border border-gray-300 rounded px-1.5 py-1 disabled:opacity-50"
                  >
                    <option value="">Mover a…</option>
                    {grupo.destinos.map((destino) => (
                      <option key={destino.id} value={destino.id}>
                        {destino.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleMover(miembro)}
                    disabled={loading || !destinoPorMiembro[miembro.username]}
                    className={`font-medium disabled:opacity-40 disabled:cursor-not-allowed ${ACCIONES.mover.className}`}
                  >
                    {ACCIONES.mover.etiquetaBoton}
                  </button>
                </>
              )}
              <button
                onClick={() => handleQuitar(miembro)}
                disabled={loading}
                className={`font-medium disabled:opacity-40 disabled:cursor-not-allowed ${ACCIONES.quitar.className}`}
              >
                {ACCIONES.quitar.etiquetaBoton}
              </button>
            </div>
            )}
          </li>
        ))}
      </ul>
      {conAcciones && error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </>
  );
}
