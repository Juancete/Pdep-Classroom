"use client";

import { useState } from "react";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
} from "@/components/DataTable";
import { matcheaEntregaQuery } from "@/lib/entrega-query";
import { CIBadge } from "@/components/CIBadge";
import { RepoDeEntrega } from "@/components/RepoDeEntrega";
import { CISyncButton } from "./ci-sync-button";
import { CIRerunButton } from "./ci-rerun-button";
import { BorrarEntregaButton } from "./borrar-entrega-button";
import type { NombreResultadoCI } from "@/domain/entities";

export type EntregaRow = {
  id: string;
  githubUsernames: string[];
  repoName?: string;
  repoUrl?: string;
  repoDeleted: boolean;
  provisionEstado?: "pendiente" | "activa" | "fallida";
  provisionUltimoError?: string;
  provisionIntentos?: number;
  estadoRepo: "borrado" | "activo" | "sin-repo";
  createdAt: string;
  nombreCompleto: string;
  grupoNombre?: string;
  ci: {
    resultadoNombre: NombreResultadoCI;
    detalleUrl?: string;
    permiteReejecucion: boolean;
  };
  // Último push conocido del repo (issue #60) — lo escribe el webhook de
  // `push`. Sin valor: todavía no llegó ningún push registrado.
  ultimoPush?: {
    fecha: string;
    por: string;
  };
};

export function filterEntregas(entregas: EntregaRow[], rawQuery: string): EntregaRow[] {
  return entregas.filter((entrega) => matcheaEntregaQuery(entrega, rawQuery));
}

export function EntregasTable({
  assignmentId,
  entregas,
  mostrarGrupo,
}: {
  assignmentId: string;
  entregas: EntregaRow[];
  mostrarGrupo: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtradas = filterEntregas(entregas, query);

  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="font-medium text-gray-700 shrink-0">
          Entregas aceptadas
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          <CISyncButton assignmentId={assignmentId} />
          <input
            type="search"
            autoComplete="new-password"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por usuario, grupo o repo..."
            className="border border-gray-300 rounded-md px-3 py-1 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-pdep-400"
          />
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          {query
            ? `No se encontraron entregas para "${query}".`
            : "No hay entregas todavía."}
        </div>
      ) : (
        <DataTable
          columns={mostrarGrupo ? "0.9fr 1.4fr 1fr 1.3fr 1fr 120px" : "1.4fr 1fr 1.3fr 1fr 120px"}
          bare
        >
          <DataHeader>
            {mostrarGrupo && <DataHeaderCell>Grupo</DataHeaderCell>}
            <DataHeaderCell>Nombre completo</DataHeaderCell>
            <DataHeaderCell>Usuario(s)</DataHeaderCell>
            <DataHeaderCell>Repositorio</DataHeaderCell>
            <DataHeaderCell>CI</DataHeaderCell>
            <DataHeaderCell>Actividad</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {filtradas.map((entrega) => (
              <DataRow key={entrega.id}>
                {mostrarGrupo && (
                  <DataCell label="Grupo">{entrega.grupoNombre ?? "—"}</DataCell>
                )}
                <DataCell label="Nombre completo" heading>
                  {entrega.nombreCompleto}
                </DataCell>
                <DataCell label="Usuario(s)">
                  <span className="font-mono text-xs break-all">
                    {entrega.githubUsernames.join(", ")}
                  </span>
                </DataCell>
                <DataCell label="Repositorio">
                  {entrega.provisionEstado && entrega.provisionEstado !== "activa" && (
                    <div className={`mb-1 text-xs ${entrega.provisionEstado === "fallida" ? "text-red-600" : "text-amber-700"}`}>
                      {entrega.provisionEstado === "fallida" ? "Aprovisionamiento fallido" : "Aprovisionamiento pendiente"}
                      {(entrega.provisionIntentos ?? 0) > 0 ? ` · ${entrega.provisionIntentos} intento(s)` : ""}
                      {entrega.provisionUltimoError && (
                        <span className="block break-words text-[11px] text-gray-500">{entrega.provisionUltimoError}</span>
                      )}
                    </div>
                  )}
                  <RepoDeEntrega estadoRepo={entrega.estadoRepo} repoUrl={entrega.repoUrl} />
                </DataCell>
                <DataCell label="CI">
                  <span className="inline-flex items-center gap-1.5">
                    <CIBadge
                      resultadoNombre={entrega.ci.resultadoNombre}
                      detalleUrl={entrega.ci.detalleUrl}
                    />
                    <CIRerunButton
                      assignmentId={assignmentId}
                      entregaId={entrega.id}
                      permiteReejecucion={entrega.ci.permiteReejecucion}
                    />
                  </span>
                </DataCell>
                <DataCell label="Actividad">
                  <span className="text-gray-500 text-xs block">{entrega.createdAt}</span>
                  {entrega.ultimoPush && (
                    <span className="text-gray-400 text-[11px] block">
                      Último push: {entrega.ultimoPush.fecha} ({entrega.ultimoPush.por})
                    </span>
                  )}
                  <span className="block mt-1">
                    <BorrarEntregaButton
                      assignmentId={assignmentId}
                      entregaId={entrega.id}
                      repoName={entrega.repoName}
                    />
                  </span>
                </DataCell>
              </DataRow>
            ))}
          </DataBody>
        </DataTable>
      )}
    </div>
  );
}
