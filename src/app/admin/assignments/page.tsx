import { requireAdmin } from "@/lib/session";
import {
  getAssignments,
  getEntregaCountsByAssignment,
  getActiveRepoCountsByAssignment,
} from "@/lib/repositories";
import Link from "next/link";
import { DeleteAssignmentButton } from "./delete-button";
import { DeleteReposButton } from "./delete-repos-button";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "@/app/components/DataTable";

export default async function AdminAssignmentsPage() {
  await requireAdmin();

  const [assignments, entregasCounts, activeRepoCounts] = await Promise.all([
    getAssignments(),
    getEntregaCountsByAssignment(),
    getActiveRepoCountsByAssignment(),
  ]);

  const sorted = [...assignments].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Assignments</h1>
        <Link
          href="/admin/assignments/new"
          className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
        >
          + Nuevo Assignment
        </Link>
      </div>

      {sorted.length === 0 ? (
        <DataEmpty>No hay assignments todavía. Creá el primero.</DataEmpty>
      ) : (
        <DataTable columns="2fr 1fr 1fr 1.5fr 90px 110px 180px">
          <DataHeader>
            <DataHeaderCell>Título</DataHeaderCell>
            <DataHeaderCell>Paradigma</DataHeaderCell>
            <DataHeaderCell>Tipo</DataHeaderCell>
            <DataHeaderCell>Template</DataHeaderCell>
            <DataHeaderCell>Entregas</DataHeaderCell>
            <DataHeaderCell>Deadline</DataHeaderCell>
            <DataHeaderCell>Acciones</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {sorted.map((a) => (
              <DataRow key={a.id}>
                <DataCell label="Título" heading>
                  {a.titulo}
                </DataCell>
                <DataCell label="Paradigma">
                  <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full">
                    {a.paradigma}
                  </span>
                </DataCell>
                <DataCell label="Tipo">
                  <span className="text-gray-500">{a.tipo}</span>
                </DataCell>
                <DataCell label="Template">
                  <span className="font-mono text-xs text-gray-500 break-all">
                    {a.templateRepo}
                  </span>
                </DataCell>
                <DataCell label="Entregas">
                  <span className="font-mono">
                    {entregasCounts.get(a.id) ?? 0}
                  </span>
                </DataCell>
                <DataCell label="Deadline">
                  <span className="text-gray-500">
                    {a.deadline
                      ? new Date(a.deadline).toLocaleDateString("es-AR")
                      : "—"}
                  </span>
                </DataCell>
                <DataCell label="">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/admin/assignments/${a.id}`}
                      className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/admin/assignments/${a.id}/edit`}
                      className="text-pdep-600 hover:text-pdep-800 text-xs font-medium"
                    >
                      Editar
                    </Link>
                    <DeleteReposButton
                      assignmentId={a.id}
                      activeRepoCount={activeRepoCounts.get(a.id) ?? 0}
                    />
                    <DeleteAssignmentButton id={a.id} titulo={a.titulo} />
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
