import Link from "next/link";
import type { HistorialDeMembresiasPage } from "@/lib/repositories";
import type { AccionCambioMembresia, OrigenCambioMembresia } from "@/domain/entities";

const ACCION_LABELS: Record<AccionCambioMembresia, string> = {
  alta: "Alta",
  baja: "Baja",
  cambio: "Cambio",
};

const ACCION_CLASSES: Record<AccionCambioMembresia, string> = {
  alta: "bg-green-50 text-green-800",
  baja: "bg-red-50 text-red-800",
  cambio: "bg-blue-50 text-blue-800",
};

const ORIGEN_CLASSES: Record<OrigenCambioMembresia, string> = {
  alumno: "bg-gray-100 text-gray-700",
  docente: "bg-pdep-100 text-pdep-700",
};

function formatearFecha(fecha: Date | string): string {
  return new Date(fecha).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function HistorialDeMembresias({
  assignmentId,
  historial,
  repoDeletionPage,
}: {
  assignmentId: string;
  historial: HistorialDeMembresiasPage;
  /** Página actual del historial de borrado de repos, para no perderla al paginar este historial. */
  repoDeletionPage?: number;
}) {
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ membresiaPage: String(page) });
    if (repoDeletionPage && repoDeletionPage > 1) {
      params.set("repoDeletionPage", String(repoDeletionPage));
    }
    return `/admin/assignments/${assignmentId}?${params.toString()}#historial-membresias`;
  };

  return (
    <section
      id="historial-membresias"
      className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold">Historial de cambios de integrantes</h2>
        <p className="mt-1 text-sm text-gray-500">
          {historial.total}{" "}
          {historial.total === 1 ? "cambio registrado" : "cambios registrados"}
        </p>
      </div>

      {historial.items.length === 0 ? (
        <p className="px-6 py-8 text-sm text-gray-500">
          Todavía no hay cambios de integrantes para este TP.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Alumno</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">De → A</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Realizado por</th>
                <th className="px-4 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {historial.items.map((cambio) => (
                <tr key={cambio.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {formatearFecha(cambio.creadoEn)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-800">
                    @{cambio.alumnoUsername}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${ACCION_CLASSES[cambio.accion]}`}
                    >
                      {ACCION_LABELS[cambio.accion]}
                    </span>
                    {cambio.grupoOrigenEliminado && (
                      <span className="ml-1 text-xs text-gray-400" title="El grupo de origen se eliminó por quedar vacío">
                        (grupo eliminado)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {cambio.grupoOrigenNombre ?? "—"} → {cambio.grupoDestinoNombre ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${ORIGEN_CLASSES[cambio.origen]}`}
                    >
                      {cambio.origen === "docente" ? "Docente" : "Alumno"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{cambio.realizadoPor}</td>
                  <td className="max-w-xs px-4 py-3 text-gray-600">
                    {cambio.motivo ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historial.totalPages > 1 && (
        <nav
          aria-label="Paginación del historial de membresías"
          className="flex items-center justify-between border-t border-gray-200 px-6 py-4 text-sm"
        >
          {historial.page > 1 ? (
            <Link className="text-pdep-600 hover:text-pdep-800" href={pageHref(historial.page - 1)}>
              ← Anterior
            </Link>
          ) : (
            <span className="text-gray-300">← Anterior</span>
          )}
          <span className="text-gray-500">
            Página {historial.page} de {historial.totalPages}
          </span>
          {historial.page < historial.totalPages ? (
            <Link className="text-pdep-600 hover:text-pdep-800" href={pageHref(historial.page + 1)}>
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
