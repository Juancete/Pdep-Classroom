import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getErrorLogsPage, getUnreadErrorLogCount } from "@/lib/repositories";
import {
  DataBody,
  DataCell,
  DataEmpty,
  DataHeader,
  DataHeaderCell,
  DataRow,
  DataTable,
} from "@/components/DataTable";
import { AcknowledgeErrorButton, ErrorLogBulkActions } from "./error-log-actions";

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function single(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result?.trim() || undefined;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("es-AR");
}

export default async function AdminErroresPage(props: {
  searchParams?: Promise<{ page?: string | string[]; route?: string | string[] }>;
}) {
  await requireAdmin();
  const emptySearchParams: { page?: string | string[]; route?: string | string[] } = {};
  const params = await (props.searchParams ?? Promise.resolve(emptySearchParams));
  const requestedPage = parsePage(params.page);
  const route = single(params.route);
  const [result, unread] = await Promise.all([
    getErrorLogsPage({ page: requestedPage, route }),
    getUnreadErrorLogCount(),
  ]);

  const pageHref = (page: number) => {
    const query = new URLSearchParams({ page: String(page) });
    if (route) query.set("route", route);
    return `/admin/errores?${query.toString()}`;
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Errores</h1>
          <p className="mt-1 text-sm text-gray-500">
            {result.total} {result.total === 1 ? "fingerprint" : "fingerprints"} en esta vista · {unread} sin leer
          </p>
        </div>
        <ErrorLogBulkActions unread={unread} />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Ruta
          <select
            name="route"
            defaultValue={route ?? ""}
            className="min-w-72 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Todas las rutas</option>
            {result.routes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Filtrar
        </button>
      </form>

      {result.items.length === 0 ? (
        <DataEmpty>
          {route ? "No hay errores para esta ruta." : "Todavía no hay errores registrados."}
        </DataEmpty>
      ) : (
        <DataTable columns="1.4fr 2.4fr 100px 150px 150px 120px 170px" minWidth="1050px">
          <DataHeader>
            <DataHeaderCell>Ruta</DataHeaderCell>
            <DataHeaderCell>Mensaje</DataHeaderCell>
            <DataHeaderCell>Ocurrencias</DataHeaderCell>
            <DataHeaderCell>Primera aparición</DataHeaderCell>
            <DataHeaderCell>Última aparición</DataHeaderCell>
            <DataHeaderCell>Estado</DataHeaderCell>
            <DataHeaderCell>Acción</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {result.items.map((errorLog) => (
              <DataRow key={errorLog.id}>
                <DataCell label="Ruta" heading>
                  <span className="break-all font-mono text-xs">{errorLog.route}</span>
                </DataCell>
                <DataCell label="Mensaje">
                  <p className="break-words text-gray-800">{errorLog.message}</p>
                  {errorLog.context && (
                    <details className="mt-2 text-xs text-gray-500">
                      <summary className="cursor-pointer font-medium">Contexto</summary>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2">
                        {JSON.stringify(errorLog.context, null, 2)}
                      </pre>
                    </details>
                  )}
                </DataCell>
                <DataCell label="Ocurrencias">{errorLog.count.toLocaleString("es-AR")}</DataCell>
                <DataCell label="Primera aparición"><span className="text-xs text-gray-600">{formatDate(errorLog.firstSeenAt)}</span></DataCell>
                <DataCell label="Última aparición"><span className="text-xs text-gray-600">{formatDate(errorLog.lastSeenAt)}</span></DataCell>
                <DataCell label="Estado">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${errorLog.acknowledgedAt ? "bg-gray-100 text-gray-700" : "bg-red-50 text-red-700"}`}>
                    {errorLog.acknowledgedAt ? "Leído" : "No leído"}
                  </span>
                  {errorLog.acknowledgedAt && <div className="mt-1 text-[11px] text-gray-500">{formatDate(errorLog.acknowledgedAt)}</div>}
                </DataCell>
                <DataCell label="Acción">
                  {errorLog.acknowledgedAt ? <span className="text-gray-400">—</span> : <AcknowledgeErrorButton id={errorLog.id} />}
                </DataCell>
              </DataRow>
            ))}
          </DataBody>
        </DataTable>
      )}

      {result.totalPages > 1 && (
        <nav aria-label="Paginación de errores" className="mt-4 flex items-center justify-between text-sm">
          {result.page > 1 ? <Link className="text-pdep-600 hover:text-pdep-800" href={pageHref(result.page - 1)}>← Anterior</Link> : <span className="text-gray-300">← Anterior</span>}
          <span className="text-gray-500">Página {result.page} de {result.totalPages}</span>
          {result.page < result.totalPages ? <Link className="text-pdep-600 hover:text-pdep-800" href={pageHref(result.page + 1)}>Siguiente →</Link> : <span className="text-gray-300">Siguiente →</span>}
        </nav>
      )}
    </div>
  );
}
