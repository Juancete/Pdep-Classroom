import { requireAdmin } from "@/infrastructure/auth/session";
import {
  getAssignment,
  getEntregas,
  getAlumnos,
  getGruposDeAssignment,
} from "@/infrastructure/repositories";
import { redirect } from "next/navigation";
import { EntregasTable } from "./entregas-table";
import { Alumno, accionesDeEstado } from "@/domain/entities";
import { AssignmentHeader } from "./assignment-header";
import { EstadoPanel } from "../estado-panel";

export default async function AssignmentDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const gruposPromise = assignment.cargarGruposCon(getGruposDeAssignment);

  const alumnosPromise = getAlumnos();
  const [entregas, alumnos, , total] = await Promise.all([
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

  const contextoTransicion = { tieneEntregas: aceptadas > 0 };
  const acciones = accionesDeEstado(assignment.estado, assignment.id, contextoTransicion);

  const alumnosPorUsername = new Map<string, Alumno>(
    alumnos.map((alumno) => [alumno.usernameCanonico, alumno])
  );

  const grupal = assignment.comoGrupal();
  const inscripciones =
    grupal && assignment.permiteAccionesDeAlumno()
      ? { cerradas: grupal.inscripcionesCerradas }
      : undefined;

  const entregaRows = entregas.map((entrega) => ({
    id: entrega.id,
    githubUsernames: entrega.githubUsernames,
    repoName: entrega.repoName,
    repoUrl: entrega.repoUrl,
    repoDeleted: entrega.repoDeleted,
    provisionEstado: entrega.provisionEstado,
    provisionUltimoError: entrega.provisionUltimoError,
    provisionIntentos: entrega.provisionIntentos,
    estadoRepo: entrega.estadoRepo(),
    createdAt: new Date(entrega.createdAt).toLocaleDateString("es-AR"),
    grupoNombre: entrega.grupo?.nombre,
    nombreCompleto: entrega.githubUsernames
      .map((username) => {
        const alumno = alumnosPorUsername.get(Alumno.normalizarUsername(username));
        return alumno ? alumno.nombreCompleto : "—";
      })
      .join(" / "),
    ci: {
      resultadoNombre: entrega.ciResultadoNombre,
      detalleUrl: entrega.ciDetalleUrl,
      permiteReejecucion: entrega.resultadoCI.permiteReejecucion(),
    },
    ultimoPush: entrega.ultimoPushEn
      ? {
          fecha: new Date(entrega.ultimoPushEn).toLocaleDateString("es-AR"),
          por: entrega.ultimoPushPor ?? "—",
        }
      : undefined,
  }));

  return (
    <div>
      <AssignmentHeader assignment={assignment} activa="detalle" />

      <EstadoPanel
        // El estado real es la key: cuando cambia (post router.refresh()),
        // React remonta el panel en vez de arrastrar el estado local
        // optimista que quedó tras la transición anterior.
        key={assignment.estadoNombre}
        assignmentId={assignment.id}
        estado={assignment.estadoNombre}
        acciones={acciones}
        inscripciones={inscripciones}
        publicadoEn={assignment.publicadoEn?.toISOString() ?? null}
        publicadoPor={assignment.publicadoPor ?? null}
        archivadoEn={assignment.archivadoEn?.toISOString() ?? null}
        archivadoPor={assignment.archivadoPor ?? null}
      />

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

      {/* Contadores: "Pendientes" no aplica a un borrador, todavía no
          aceptable. */}
      <div
        className={`grid gap-4 mb-6 ${
          assignment.esperaEntregas() ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-pdep-600">{aceptadas}</div>
          <div className="text-sm text-gray-500 mt-1">Aceptadas</div>
        </div>
        {assignment.esperaEntregas() && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-amber-600">{pendientes}</div>
            <div className="text-sm text-gray-500 mt-1">Pendientes</div>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-gray-600">{total}</div>
          <div className="text-sm text-gray-500 mt-1">
            {assignment.etiquetaTotales()} totales
          </div>
        </div>
      </div>

      {/* Tabla de entregas (componente cliente con filtro) */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <EntregasTable
          assignmentId={assignment.id}
          entregas={entregaRows}
          mostrarGrupo={grupal !== null}
        />
      </div>
    </div>
  );
}
