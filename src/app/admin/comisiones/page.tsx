import { requireAdmin } from "@/lib/session";
import { getComisiones } from "@/lib/repositories";
import { DeleteComisionButton } from "./delete-button";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "@/components/DataTable";

export default async function AdminComisionesPage() {
  await requireAdmin();
  const comisiones = await getComisiones();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Comisiones</h1>
        <a
          href="/admin/comisiones/new"
          className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
        >
          Nueva Comisión
        </a>
      </div>

      {comisiones.length === 0 ? (
        <DataEmpty>No hay comisiones todavía.</DataEmpty>
      ) : (
        <DataTable columns="100px 2fr 140px 160px">
          <DataHeader>
            <DataHeaderCell>Año</DataHeaderCell>
            <DataHeaderCell>Planilla</DataHeaderCell>
            <DataHeaderCell>Estado</DataHeaderCell>
            <DataHeaderCell>Acciones</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {comisiones.map((comision) => (
              <DataRow key={comision.id}>
                <DataCell label="Año" heading>
                  {comision.anio}
                </DataCell>
                <DataCell label="Planilla">
                  <span className="font-mono text-xs text-gray-500 break-all md:truncate md:block">
                    {comision.spreadsheetId}
                  </span>
                </DataCell>
                <DataCell label="Estado">
                  {comision.activa ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Activa
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Inactiva</span>
                  )}
                </DataCell>
                <DataCell label="Acciones">
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href={`/admin/comisiones/${comision.id}/edit`}
                      className="text-pdep-600 hover:text-pdep-800 text-xs font-medium"
                    >
                      Editar
                    </a>
                    {!comision.activa && (
                      <DeleteComisionButton id={comision.id} anio={comision.anio} />
                    )}
                  </div>
                </DataCell>
              </DataRow>
            ))}
          </DataBody>
        </DataTable>
      )}
    </div>
  );
}
