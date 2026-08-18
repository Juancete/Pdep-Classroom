"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";

export type GrupoAdminResumen = {
  id: string;
  nombre: string;
  maxIntegrantes: number;
  estaLleno: boolean;
  etiquetaCupo: string;
  tieneEntrega: boolean;
  miembros: { username: string; nombreCompleto: string }[];
};

export type AlumnoSinGrupoResumen = {
  username: string;
  nombreCompleto: string;
};

// Config por acción: texto del botón, confirmación base y estilo — dato, no
// rama de lógica. Mismo idioma que `estado-panel.tsx`.
const ACCIONES: Record<
  "quitar" | "mover" | "agregar",
  { etiquetaBoton: string; confirmacion: string; className: string }
> = {
  quitar: {
    etiquetaBoton: "Quitar",
    confirmacion: "¿Seguro que querés quitar a este alumno del grupo?",
    className: "text-red-600 hover:text-red-800",
  },
  mover: {
    etiquetaBoton: "Mover",
    confirmacion: "¿Seguro que querés mover a este alumno de grupo?",
    className: "text-pdep-600 hover:text-pdep-800",
  },
  agregar: {
    etiquetaBoton: "Agregar",
    confirmacion: "¿Seguro que querés agregar a este alumno al grupo?",
    className: "text-pdep-600 hover:text-pdep-800",
  },
};

// Advertencias que se agregan a la confirmación según el estado del grupo
// afectado — también dato, para no meter ifs en el render.
const ADVERTENCIAS: { aplica: (grupo: GrupoAdminResumen) => boolean; texto: string }[] = [
  {
    aplica: (grupo) => grupo.tieneEntrega,
    texto:
      "El grupo ya entregó: el repositorio queda con los colaboradores desincronizados y hay que ajustarlos a mano en GitHub.",
  },
  {
    aplica: (grupo) => grupo.miembros.length === 1 && !grupo.tieneEntrega,
    texto: "Es el último integrante: el grupo se va a eliminar y su nombre queda libre.",
  },
];

function confirmacionPara(
  accion: "quitar" | "mover" | "agregar",
  grupoAfectado: GrupoAdminResumen
): string {
  const advertencias = ADVERTENCIAS.filter((item) => item.aplica(grupoAfectado)).map(
    (item) => item.texto
  );
  return [ACCIONES[accion].confirmacion, ...advertencias].join(" ");
}

// Aparte de ADVERTENCIAS: "último integrante" no tiene sentido evaluado
// sobre el destino de un movimiento (gana un integrante, no lo pierde), así
// que el destino sólo suma esta advertencia puntual sobre colaboradores.
function advertenciaEntregaDestino(grupoDestino: GrupoAdminResumen): string | null {
  return grupoDestino.tieneEntrega
    ? "El grupo destino ya entregó: sumar a alguien también desincroniza sus colaboradores."
    : null;
}

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
  const [destinoPorMiembro, setDestinoPorMiembro] = useState<Record<string, string>>({});
  const [destinoPorAlumno, setDestinoPorAlumno] = useState<Record<string, string>>({});

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

  async function handleQuitar(grupo: GrupoAdminResumen, username: string) {
    if (!confirm(confirmacionPara("quitar", grupo))) return;

    await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupo.id}/miembros/${username}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al quitar al alumno del grupo");
      }
      router.refresh();
    });
  }

  async function handleMover(grupoOrigen: GrupoAdminResumen, username: string) {
    const grupoDestinoId = destinoPorMiembro[username];
    if (!grupoDestinoId) return;
    const grupoDestino = grupos.find((grupo) => grupo.id === grupoDestinoId);
    const advertenciaDestino = grupoDestino ? advertenciaEntregaDestino(grupoDestino) : null;
    const confirmacion = [confirmacionPara("mover", grupoOrigen), advertenciaDestino]
      .filter(Boolean)
      .join(" ");
    if (!confirm(confirmacion)) return;

    await call(async () => {
      const response = await fetch(
        `/api/assignments/${assignmentId}/grupos/${grupoDestinoId}/miembros/${username}`,
        { method: "PUT" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Error al mover al alumno de grupo");
      }
      router.refresh();
    });
  }

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
            {grupos.map((grupo) => {
              const otrosGruposConCupo = grupos.filter(
                (otro) => otro.id !== grupo.id && !otro.estaLleno
              );
              return (
                <li key={grupo.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{grupo.nombre}</span>
                    <div className="flex items-center gap-2">
                      {grupo.tieneEntrega && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          Ya entregó
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          grupo.estaLleno
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {grupo.etiquetaCupo}
                      </span>
                    </div>
                  </div>
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
                        <div className="flex items-center gap-1.5">
                          {otrosGruposConCupo.length > 0 && (
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
                                {otrosGruposConCupo.map((otro) => (
                                  <option key={otro.id} value={otro.id}>
                                    {otro.nombre}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleMover(grupo, miembro.username)}
                                disabled={loading || !destinoPorMiembro[miembro.username]}
                                className={`font-medium disabled:opacity-40 disabled:cursor-not-allowed ${ACCIONES.mover.className}`}
                              >
                                {ACCIONES.mover.etiquetaBoton}
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleQuitar(grupo, miembro.username)}
                            disabled={loading}
                            className={`font-medium disabled:opacity-40 disabled:cursor-not-allowed ${ACCIONES.quitar.className}`}
                          >
                            {ACCIONES.quitar.etiquetaBoton}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
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
              const gruposConCupo = grupos.filter((grupo) => !grupo.estaLleno);
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
