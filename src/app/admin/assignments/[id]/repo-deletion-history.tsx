import Link from "next/link";
import type { RepoDeletionHistoryPage } from "@/infrastructure/repositories";
import type { RepoDeletionStatus } from "@/domain/entities";

const STATUS_LABELS: Record<RepoDeletionStatus, string> = {
  pending: "Pendiente / incierto",
  deleted: "Eliminado",
  already_absent: "Ya estaba ausente",
  failed: "Fallido",
};

const STATUS_CLASSES: Record<RepoDeletionStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  deleted: "bg-green-50 text-green-800",
  already_absent: "bg-gray-100 text-gray-700",
  failed: "bg-red-50 text-red-800",
};

export function RepoDeletionHistory({
  assignmentId,
  history,
}: {
  assignmentId: string;
  history: RepoDeletionHistoryPage;
}) {
  const pageHref = (page: number) =>
    `/admin/assignments/${assignmentId}?repoDeletionPage=${page}#repo-deletion-history`;

  return (
    <section
      id="repo-deletion-history"
      className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold">Historial de borrado de repositorios</h2>
        <p className="mt-1 text-sm text-gray-500">
          {history.total} {history.total === 1 ? "intento registrado" : "intentos registrados"}
        </p>
      </div>

      {history.items.length === 0 ? (
        <p className="px-6 py-8 text-sm text-gray-500">
          Todavía no hay intentos de borrado para este assignment.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Repositorio</th>
                <th className="px-4 py-3">Administrador</th>
                <th className="px-4 py-3">Operación</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.items.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {new Date(attempt.startedAt).toLocaleString("es-AR")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-800">
                    {attempt.repoName}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{attempt.requestedBy}</td>
                  <td
                    className="px-4 py-3 font-mono text-xs text-gray-500"
                    title={attempt.operationId}
                  >
                    {attempt.operationId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${STATUS_CLASSES[attempt.status]}`}
                    >
                      {STATUS_LABELS[attempt.status]}
                    </span>
                  </td>
                  <td className="max-w-md px-4 py-3 text-gray-600">
                    {attempt.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {history.totalPages > 1 && (
        <nav
          aria-label="Paginación del historial de borrados"
          className="flex items-center justify-between border-t border-gray-200 px-6 py-4 text-sm"
        >
          {history.page > 1 ? (
            <Link className="text-pdep-600 hover:text-pdep-800" href={pageHref(history.page - 1)}>
              ← Anterior
            </Link>
          ) : (
            <span className="text-gray-300">← Anterior</span>
          )}
          <span className="text-gray-500">
            Página {history.page} de {history.totalPages}
          </span>
          {history.page < history.totalPages ? (
            <Link className="text-pdep-600 hover:text-pdep-800" href={pageHref(history.page + 1)}>
              Siguiente →
            </Link>
          ) : (
            <span className="text-gray-300">Siguiente →</span>
          )}
        </nav>
      )}
    </section>
  );
}
