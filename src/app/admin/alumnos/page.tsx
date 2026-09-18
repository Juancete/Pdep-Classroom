import Link from "next/link";
import { requireAdmin } from "@/infrastructure/auth/session";
import { getAlumnosPage, getComisionActiva } from "@/infrastructure/repositories";
import { parsePage, single } from "@/lib/search-params";
import { Paginador } from "@/components/Paginador";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "@/components/DataTable";

export default async function AdminAlumnosPage(props: {
  searchParams?: Promise<{ page?: string | string[]; q?: string | string[] }>;
}) {
  await requireAdmin();

  const comision = await getComisionActiva();
  if (!comision) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Alumnos</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-yellow-800">
          No hay ninguna comisión activa configurada.{" "}
          <Link href="/admin/comisiones/new" className="underline font-medium">
            Crear una comisión
          </Link>{" "}
          para poder ver los alumnos.
        </div>
      </div>
    );
  }

  const emptySearchParams: { page?: string | string[]; q?: string | string[] } = {};
  const params = await (props.searchParams ?? Promise.resolve(emptySearchParams));
  const requestedPage = parsePage(params.page);
  const busqueda = single(params.q);
  const result = await getAlumnosPage({
    comisionId: comision.id,
    page: requestedPage,
    busqueda,
  });

  const pageHref = (page: number) => {
    const query = new URLSearchParams({ page: String(page) });
    if (busqueda) query.set("q", busqueda);
    return `/admin/alumnos?${query.toString()}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Alumnos</h1>
      <p className="text-gray-500 text-sm mb-6">
        Alumnos sincronizados de la comisión activa.{" "}
        <span className="font-mono text-xs">
          {busqueda ? `${result.total} resultados para "${busqueda}"` : `${result.total} alumnos`}
        </span>
      </p>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Buscar
          <input
            type="search"
            name="q"
            defaultValue={busqueda ?? ""}
            placeholder="Apellido, nombre, legajo, GitHub o email"
            className="min-w-72 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Buscar
        </button>
        {busqueda && (
          <Link href="/admin/alumnos" className="text-sm text-pdep-600 hover:text-pdep-800">
            Limpiar
          </Link>
        )}
      </form>

      {result.items.length === 0 ? (
        <DataEmpty>
          {busqueda ? `No se encontraron alumnos para "${busqueda}".` : "No hay alumnos ingresados."}
        </DataEmpty>
      ) : (
        <DataTable columns="1.5fr 100px 1.2fr 2fr">
          <DataHeader>
            <DataHeaderCell>Nombre</DataHeaderCell>
            <DataHeaderCell>Legajo</DataHeaderCell>
            <DataHeaderCell>GitHub</DataHeaderCell>
            <DataHeaderCell>Email</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {result.items.map((alumno) => (
              <DataRow key={alumno.id}>
                <DataCell label="Nombre" heading>
                  {alumno.nombreCompleto}
                </DataCell>
                <DataCell label="Legajo">
                  <span className="font-mono text-xs">{alumno.legajo}</span>
                </DataCell>
                <DataCell label="GitHub">
                  <a
                    href={`https://github.com/${alumno.githubUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-pdep-600 hover:underline break-all"
                  >
                    {alumno.githubUsername}
                  </a>
                </DataCell>
                <DataCell label="Email">
                  <span className="text-gray-500 text-xs break-all">
                    {alumno.email}
                  </span>
                </DataCell>
              </DataRow>
            ))}
          </DataBody>
        </DataTable>
      )}

      <Paginador
        page={result.page}
        totalPages={result.totalPages}
        hrefDePagina={pageHref}
        ariaLabel="Paginación de alumnos"
      />
    </div>
  );
}
