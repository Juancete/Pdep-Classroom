import { requireAdmin } from "@/lib/session";
import { getAssignments, getEntregaCountsByAssignment } from "@/lib/repositories";
import Link from "next/link";
import { DeleteAssignmentButton } from "./delete-button";

export default async function AdminAssignmentsPage() {
  await requireAdmin();

  // Una query para assignments, una para conteos — en paralelo
  const [assignments, entregasCounts] = await Promise.all([
    getAssignments(),
    getEntregaCountsByAssignment(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Assignments</h1>
        <Link
          href="/admin/assignments/new"
          className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
        >
          + Nuevo Assignment
        </Link>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No hay assignments todavía. Creá el primero.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Título
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Paradigma
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Tipo
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Template
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Entregas
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Deadline
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                )
                .map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{a.titulo}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full">
                        {a.paradigma}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{a.tipo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {a.templateRepo}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {entregasCounts.get(a.id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {a.deadline
                        ? new Date(a.deadline).toLocaleDateString("es-AR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/assignments/${a.id}/edit`}
                          className="text-pdep-600 hover:text-pdep-800 text-xs font-medium"
                        >
                          Editar
                        </Link>
                        <DeleteAssignmentButton id={a.id} titulo={a.titulo} />
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
