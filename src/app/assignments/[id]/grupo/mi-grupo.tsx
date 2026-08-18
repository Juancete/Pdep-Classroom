import { AcceptButton } from "@/app/dashboard/accept-button";
import { AccionesDeMembresia, type GrupoDisponible } from "./acciones-de-membresia";

export type GrupoResumen = {
  id: string;
  nombre: string;
  paradigma: string;
  maxIntegrantes: number;
  estaLleno: boolean;
  etiquetaCupo: string;
  miembros: string[];
};

export function MiGrupo({
  grupo,
  assignmentId,
  tieneEntrega,
  githubUsername,
  motivoBloqueo,
  esUltimoMiembro,
  gruposDisponibles,
}: {
  grupo: GrupoResumen;
  assignmentId: string;
  tieneEntrega: boolean;
  githubUsername: string;
  motivoBloqueo: string | null;
  esUltimoMiembro: boolean;
  gruposDisponibles: GrupoDisponible[];
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{grupo.nombre}</h2>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            grupo.estaLleno
              ? "bg-gray-100 text-gray-600"
              : "bg-green-50 text-green-700"
          }`}
        >
          {grupo.etiquetaCupo}
        </span>
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-1">Integrantes:</p>
        <ul className="space-y-1">
          {grupo.miembros.map((username) => (
            <li key={username} className="text-sm font-mono text-gray-700">
              @{username}
            </li>
          ))}
        </ul>
      </div>

      {!tieneEntrega && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">
            Ya estás en el grupo. Cuando todos estén listos, aceptá el TP para
            crear el repositorio.
          </p>
          <AcceptButton assignmentId={assignmentId} />
        </div>
      )}

      <AccionesDeMembresia
        assignmentId={assignmentId}
        grupoId={grupo.id}
        githubUsername={githubUsername}
        motivoBloqueo={motivoBloqueo}
        esUltimoMiembro={esUltimoMiembro}
        gruposDisponibles={gruposDisponibles}
      />
    </div>
  );
}
