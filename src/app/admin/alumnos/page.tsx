import { requireAdmin } from "@/lib/session";
import { getAlumnos } from "@/lib/sheets";

export default async function AdminAlumnosPage() {
  await requireAdmin();
  const alumnos = await getAlumnos();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Alumnos</h1>
      <p className="text-gray-500 text-sm mb-6">
        Se leen de la planilla de Google Sheets.{" "}
        <span className="font-mono text-xs">{alumnos.length} alumnos</span>
      </p>

      {alumnos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No hay alumnos ingresados.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Legajo
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Nombre
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  GitHub
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Email
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alumnos.map((a) => (
                <tr key={a.legajo} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {a.legajo}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.apellido}, {a.nombre}
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      href={`https://github.com/${a.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-pdep-600 hover:underline"
                    >
                      {a.githubUsername}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {a.email}
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
