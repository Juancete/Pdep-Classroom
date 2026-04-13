"use client";

import { useState } from "react";

export type EntregaRow = {
  id: string;
  githubUsernames: string[];
  repoName?: string;
  repoUrl?: string;
  createdAt: string;
  nombreCompleto: string;
};

export function filterEntregas(entregas: EntregaRow[], q: string): EntregaRow[] {
  const query = q.toLowerCase().trim();
  if (!query) return entregas;
  return entregas.filter(
    (e) =>
      e.githubUsernames.some((u) => u.toLowerCase().includes(query)) ||
      (e.repoName ?? "").toLowerCase().includes(query)
  );
}

export function EntregasTable({ entregas }: { entregas: EntregaRow[] }) {
  const [q, setQ] = useState("");
  const filtradas = filterEntregas(entregas, q);

  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
        <h2 className="font-medium text-gray-700 shrink-0">
          Entregas aceptadas
        </h2>
        <input
          type="search"
          autoComplete="new-password"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por usuario o repo..."
          className="border border-gray-300 rounded-md px-3 py-1 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-pdep-400"
        />
      </div>

      {filtradas.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          {q
            ? `No se encontraron entregas para "${q}".`
            : "No hay entregas todavía."}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Usuario(s)
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Nombre completo
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Repositorio
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Fecha
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtradas.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">
                  {e.githubUsernames.join(", ")}
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  {e.nombreCompleto}
                </td>
                <td className="px-4 py-3">
                  {e.repoUrl ? (
                    <a
                      href={e.repoUrl}
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
                  ) : (
                    <span className="text-gray-400 text-xs">Sin repo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {e.createdAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
