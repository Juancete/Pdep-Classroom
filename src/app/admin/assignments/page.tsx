import { requireAdmin } from "@/lib/session";
import {
  getAssignments,
  getEntregaCountsByAssignment,
  getActiveRepoCountsByAssignment,
} from "@/lib/repositories";
import Link from "next/link";
import { DeleteAssignmentButton } from "./delete-button";
import { DeleteReposButton } from "./delete-repos-button";
import { NOMBRES_ESTADO_ASSIGNMENT } from "@/domain/entities";
import type { NombreEstadoAssignment } from "@/types";
import { EstadoAssignmentBadge } from "@/app/components/EstadoAssignmentBadge";
import {
  DataTable,
  DataHeader,
  DataHeaderCell,
  DataBody,
  DataRow,
  DataCell,
  DataEmpty,
} from "@/app/components/DataTable";

export default async function AdminAssignmentsPage(
  props: { searchParams?: Promise<{ estado?: string }> } = {}
) {
  const emptySearchParams: { estado?: string } = {};
  const searchParams = await (props.searchParams ?? Promise.resolve(emptySearchParams));
  await requireAdmin();

  const estadoFilter = NOMBRES_ESTADO_ASSIGNMENT.includes(
    searchParams.estado as NombreEstadoAssignment
  )
    ? (searchParams.estado as NombreEstadoAssignment)
    : undefined;

  const [assignments, entregasCounts, activeRepoCounts] = await Promise.all([
    getAssignments(estadoFilter ? { estado: estadoFilter } : undefined),
    getEntregaCountsByAssignment(),
    getActiveRepoCountsByAssignment(),
  ]);

  const sorted = [...assignments].sort(
    (anterior, siguiente) =>
      new Date(siguiente.createdAt).getTime() - new Date(anterior.createdAt).getTime()
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

      {/* Filtro por estado */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href="/admin/assignments"
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            !estadoFilter
              ? "bg-pdep-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Todos
        </Link>
        {NOMBRES_ESTADO_ASSIGNMENT.map((estado) => (
          <Link
            key={estado}
            href={`/admin/assignments?estado=${estado}`}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              estadoFilter === estado
                ? "bg-pdep-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {estado.charAt(0).toUpperCase() + estado.slice(1)}
          </Link>
        ))}
      </div>

      {sorted.length === 0 ? (
        <DataEmpty>
          {estadoFilter
            ? `No hay assignments en estado ${estadoFilter}.`
            : "No hay assignments todavía. Creá el primero."}
        </DataEmpty>
      ) : (
        <DataTable columns="2fr 100px 1fr 1fr 1fr 1.5fr 90px 110px 180px">
          <DataHeader>
            <DataHeaderCell>Título</DataHeaderCell>
            <DataHeaderCell>Estado</DataHeaderCell>
            <DataHeaderCell>Paradigma</DataHeaderCell>
            <DataHeaderCell>Tipo</DataHeaderCell>
            <DataHeaderCell>Comisión</DataHeaderCell>
            <DataHeaderCell>Template</DataHeaderCell>
            <DataHeaderCell>Entregas</DataHeaderCell>
            <DataHeaderCell>Deadline</DataHeaderCell>
            <DataHeaderCell>Acciones</DataHeaderCell>
          </DataHeader>
          <DataBody>
            {sorted.map((assignment) => (
              <DataRow key={assignment.id}>
                <DataCell label="Título" heading>
                  {assignment.titulo}
                </DataCell>
                <DataCell label="Estado">
                  <EstadoAssignmentBadge estado={assignment.estadoNombre} />
                </DataCell>
                <DataCell label="Paradigma">
                  <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full">
                    {assignment.paradigma}
                  </span>
                </DataCell>
                <DataCell label="Tipo">
                  <span className="text-gray-500">{assignment.tipo}</span>
                </DataCell>
                <DataCell label="Comisión">
                  {assignment.comision ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                      {assignment.comision.anio}
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          assignment.comision.activa
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {assignment.comision.activa ? "Activa" : "Histórica"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Sin comisión</span>
                  )}
                </DataCell>
                <DataCell label="Template">
                  <span className="font-mono text-xs text-gray-500 break-all">
                    {assignment.templateRepo}
                  </span>
                </DataCell>
                <DataCell label="Entregas">
                  <span className="font-mono">
                    {entregasCounts.get(assignment.id) ?? 0}
                  </span>
                </DataCell>
                <DataCell label="Deadline">
                  <span className="text-gray-500">
                    {assignment.deadline
                      ? new Date(assignment.deadline).toLocaleDateString("es-AR")
                      : "—"}
                  </span>
                </DataCell>
                <DataCell label="">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/admin/assignments/${assignment.id}`}
                      className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/admin/assignments/${assignment.id}/edit`}
                      className="text-pdep-600 hover:text-pdep-800 text-xs font-medium"
                    >
                      Editar
                    </Link>
                    <DeleteReposButton
                      assignmentId={assignment.id}
                      activeRepoCount={activeRepoCounts.get(assignment.id) ?? 0}
                    />
                    <DeleteAssignmentButton id={assignment.id} titulo={assignment.titulo} />
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
