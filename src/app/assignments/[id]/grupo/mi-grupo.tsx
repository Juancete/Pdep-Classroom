import { AcceptButton } from "@/app/dashboard/accept-button";
import { AccionesDeMembresia, type GrupoDisponible } from "./acciones-de-membresia";
import { ListaDeIntegrantes } from "@/components/ListaDeIntegrantes";
import type { IntegranteResumen } from "@/domain/entities";

export type GrupoResumen = {
  id: string;
  nombre: string;
  paradigma: string;
  maxIntegrantes: number;
  estaLleno: boolean;
  etiquetaCupo: string;
  miembros: string[];
  // El grupo ya aceptó el TP y su repo está activo (`Entrega.hasRepo()`):
  // unirse ahí otorga acceso al repositorio (issue #123).
  tieneRepoActivo: boolean;
};

export function MiGrupo({
  grupo,
  assignmentId,
  tieneRepo,
  tieneAccesoAlRepo,
  integrantes,
  githubUsername,
  motivoBloqueo,
  esUltimoMiembro,
  gruposDisponibles,
}: {
  grupo: GrupoResumen;
  assignmentId: string;
  tieneRepo: boolean;
  tieneAccesoAlRepo: boolean;
  // Issue #138: nombre + acceso al repo de cada integrante — reemplaza el
  // `<ul>` de sólo usernames que había acá. Lo resuelve
  // `Grupo.resumenDeIntegrantes` en el server component (`page.tsx`).
  integrantes: IntegranteResumen[];
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
        <ListaDeIntegrantes integrantes={integrantes} tieneRepo={tieneRepo} />
      </div>

      {!tieneRepo && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">
            Ya estás en el grupo. Cuando todos estén listos, aceptá el TP para
            crear el repositorio.
          </p>
          <AcceptButton assignmentId={assignmentId} />
        </div>
      )}

      {tieneRepo && !tieneAccesoAlRepo && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">
            El repositorio del grupo ya está creado, pero todavía no tenés
            acceso. Pedí tu acceso desde acá.
          </p>
          <AcceptButton
            assignmentId={assignmentId}
            etiqueta="Pedir acceso"
            etiquetaCargando="Pidiendo acceso…"
          />
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
