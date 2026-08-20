"use client";

import { useState } from "react";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
} from "@/app/components/DataTable";
import { matcheaEntregaQuery } from "@/lib/entrega-query";
import { CIBadge } from "@/app/components/CIBadge";
import { CISyncButton } from "./ci-sync-button";
import { CIRerunButton } from "./ci-rerun-button";
import type { NombreResultadoCI } from "@/domain/entities";

export type EntregaRow = {
  id: string;
  githubUsernames: string[];
  repoName?: string;
  repoUrl?: string;
  repoDeleted: boolean;
  estadoRepo: "borrado" | "activo" | "sin-repo";
  createdAt: string;
  nombreCompleto: string;
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
}: {
  assignmentId: string;
  entregas: EntregaRow[];
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
            placeholder="Buscar por usuario o repo..."
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
        <DataTable columns="1.4fr 1fr 1.3fr 1fr 120px" bare>
          <DataHeader>
            <DataHeaderCell>Nombre completo</DataHeaderCell>
            <DataHeaderCell>Usuario(s)</DataHeaderCell>
            <DataHeaderCell>Repositorio</DataHeaderCell>
            <DataHeaderCell>CI</DataHeaderCell>
            <DataHeaderCell>Actividad</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {filtradas.map((entrega) => (
              <DataRow key={entrega.id}>
                <DataCell label="Nombre completo" heading>
                  {entrega.nombreCompleto}
                </DataCell>
                <DataCell label="Usuario(s)">
                  <span className="font-mono text-xs break-all">
                    {entrega.githubUsernames.join(", ")}
                  </span>
                </DataCell>
                <DataCell label="Repositorio">
                  {entrega.estadoRepo === "borrado" && (
                    <span className="text-red-400 text-xs">Repositorio borrado</span>
                  )}
                  {entrega.estadoRepo === "activo" && (
                    <a
                      href={entrega.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                      Ir al repo
                    </a>
                  )}
                  {entrega.estadoRepo === "sin-repo" && (
                    <span className="text-gray-400 text-xs">Sin repo</span>
                  )}
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
                </DataCell>
              </DataRow>
            ))}
          </DataBody>
        </DataTable>
      )}
    </div>
  );
}
