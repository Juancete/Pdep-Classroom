import { requireAdmin } from "@/lib/session";
import { getComisiones } from "@/lib/repositories";
import { DeleteComisionButton } from "./delete-button";

export default async function AdminComisionesPage() {
  await requireAdmin();
  const comisiones = await getComisiones();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Comisiones</h1>
        <a
          href="/admin/comisiones/new"
          className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
        >
          Nueva Comisión
        </a>
      </div>

      {comisiones.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No hay comisiones todavía.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Año</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Planilla</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comisiones.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{c.anio}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-xs truncate">
                    {c.spreadsheetId}
                  </td>
                  <td className="px-4 py-3">
                    {c.activa ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Activa
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Inactiva</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <a
                        href={`/admin/comisiones/${c.id}/edit`}
                        className="text-pdep-600 hover:text-pdep-800 text-xs font-medium"
                      >
                        Editar
                      </a>
                      <DeleteComisionButton id={c.id} anio={c.anio} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
