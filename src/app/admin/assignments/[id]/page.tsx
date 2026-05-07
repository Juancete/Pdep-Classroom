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
import { DeleteReposButton } from "../delete-repos-button";
import { GruposPanel } from "./grupos-panel";
import type { GrupoAdminResumen, AlumnoSinGrupoResumen } from "./grupos-panel";
import { GrupalAssignment } from "@/domain/entities";
import type { Alumno, Grupo } from "@/domain/entities";

export default async function AssignmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const gruposPromise: Promise<Grupo[]> = assignment instanceof GrupalAssignment
    ? getGruposDeAssignment(params.id)
    : Promise.resolve([]);

  const alumnosPromise = getAlumnos();
  const [entregas, alumnos, grupos, total] = await Promise.all([
    getEntregas(params.id),
    alumnosPromise,
    gruposPromise,
    assignment.totalEsperado({
      getAlumnosDelCurso: () => alumnosPromise,
      getGruposDeAssignment: (_assignmentId: string) => gruposPromise,
    }),
  ]);

  const aceptadas = entregas.length;
  const pendientes = Math.max(0, total - aceptadas);

  const alumnosPorUsername = new Map<string, Alumno>(
    alumnos.map((alumno) => [alumno.githubUsername.toLowerCase(), alumno])
  );

  let gruposPanel: React.ReactNode = null;
  if (assignment instanceof GrupalAssignment) {
    const alumnosConGrupoSet = new Set(
      grupos.flatMap((grupo) =>
        grupo.alumnos.getItems().map((alumno) => alumno.githubUsername.toLowerCase())
      )
    );

    const gruposSerializados: GrupoAdminResumen[] = grupos.map((grupo) => ({
      id: grupo.id,
      nombre: grupo.nombre,
      maxIntegrantes: grupo.maxIntegrantes,
      estaLleno: !grupo.isOpen(),
      miembros: grupo.alumnos.getItems().map((alumno) => ({
        username: alumno.githubUsername,
        nombreCompleto:
          alumnosPorUsername.get(alumno.githubUsername.toLowerCase())
            ?.nombreCompleto ?? alumno.githubUsername,
      })),
    }));

    const alumnosSinGrupoSerializados: AlumnoSinGrupoResumen[] = alumnos
      .filter((alumno) => !alumnosConGrupoSet.has(alumno.githubUsername.toLowerCase()))
      .map((alumno) => ({
        username: alumno.githubUsername,
        nombreCompleto: alumno.nombreCompleto,
      }));

    gruposPanel = (
      <GruposPanel
        assignmentId={params.id}
        inscripcionesCerradas={assignment.inscripcionesCerradas}
        grupos={gruposSerializados}
        alumnosSinGrupo={alumnosSinGrupoSerializados}
      />
    );
  }

  const entregaRows = entregas.map((entrega) => ({
    id: entrega.id,
    githubUsernames: entrega.githubUsernames,
    repoName: entrega.repoName,
    repoUrl: entrega.repoUrl,
    repoDeleted: entrega.repoDeleted,
    createdAt: new Date(entrega.createdAt).toLocaleDateString("es-AR"),
    nombreCompleto: entrega.githubUsernames
      .map((username) => {
        const alumno = alumnosPorUsername.get(username.toLowerCase());
        return alumno ? `${alumno.apellido}, ${alumno.nombre}` : "—";
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
        <div className="flex items-center gap-3">
          <DeleteReposButton
            assignmentId={assignment.id}
            activeRepoCount={entregas.filter((entrega) => entrega.repoName && !entrega.repoDeleted).length}
          />
          <Link
            href={`/admin/assignments/${assignment.id}/edit`}
            className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
          >
            Editar
          </Link>
        </div>
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
            {assignment.etiquetaTotales()} totales
          </div>
        </div>
      </div>

      {/* Tabla de entregas (componente cliente con filtro) */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <EntregasTable entregas={entregaRows} />
      </div>

      {gruposPanel}
    </div>
  );
}
