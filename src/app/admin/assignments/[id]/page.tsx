import { requireAdmin } from "@/lib/session";
import {
  getAssignment,
  getEntregas,
  getAlumnos,
  getGruposDeAssignment,
} from "@/lib/repositories";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EntregasTable } from "./entregas-table";
import type { Alumno } from "@/domain/entities";

export default async function AssignmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const [entregas, alumnos, gruposRef] = await Promise.all([
    getEntregas(params.id),
    getAlumnos(),
    assignment.tipo === "grupal"
      ? getGruposDeAssignment(params.id)
      : Promise.resolve([]),
  ]);

  const total =
    assignment.tipo === "individual" ? alumnos.length : gruposRef.length;
  const aceptadas = entregas.length;
  const pendientes = Math.max(0, total - aceptadas);

  const alumnosPorUsername = new Map<string, Alumno>(
    alumnos.map((a) => [a.githubUsername.toLowerCase(), a])
  );

  const entregaRows = entregas.map((e) => ({
    id: e.id,
    githubUsernames: e.githubUsernames,
    repoName: e.repoName,
    repoUrl: e.repoUrl,
    createdAt: new Date(e.createdAt).toLocaleDateString("es-AR"),
    nombreCompleto: e.githubUsernames
      .map((u) => {
        const a = alumnosPorUsername.get(u.toLowerCase());
        return a ? `${a.apellido}, ${a.nombre}` : "—";
      })
      .join(" / "),
  }));

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/assignments"
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold">{assignment.titulo}</h1>
        </div>
        <Link
          href={`/admin/assignments/${assignment.id}/edit`}
          className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
        >
          Editar
        </Link>
      </div>

      {/* Metadata del assignment */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full">
            {assignment.paradigma}
          </span>
          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
            {assignment.tipo}
          </span>
          {assignment.deadline && (
            <span className="text-xs text-gray-500">
              Deadline:{" "}
              {new Date(assignment.deadline).toLocaleDateString("es-AR")}
            </span>
          )}
        </div>
        {assignment.descripcion && (
          <p className="text-gray-700 mb-4">{assignment.descripcion}</p>
        )}
        <p className="text-xs font-mono text-gray-500">
          Template: {assignment.templateRepo}
        </p>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-pdep-600">{aceptadas}</div>
          <div className="text-sm text-gray-500 mt-1">Aceptadas</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-amber-600">{pendientes}</div>
          <div className="text-sm text-gray-500 mt-1">Pendientes</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-gray-600">{total}</div>
          <div className="text-sm text-gray-500 mt-1">
            {assignment.tipo === "individual" ? "Alumnos" : "Grupos"} totales
          </div>
        </div>
      </div>

      {/* Tabla de entregas (componente cliente con filtro) */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <EntregasTable entregas={entregaRows} />
      </div>
    </div>
  );
}
