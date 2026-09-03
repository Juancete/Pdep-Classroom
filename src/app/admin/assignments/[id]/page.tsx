import { requireAdmin } from "@/lib/session";
import {
  getAssignment,
  getEntregas,
  getAlumnos,
  getGruposDeAssignment,
  getRepoDeletionHistory,
  getHistorialDeMembresias,
} from "@/lib/repositories";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EntregasTable } from "./entregas-table";
import { DeleteReposButton } from "../delete-repos-button";
import { GruposPanel } from "./grupos-panel";
import type { GrupoAdminResumen, AlumnoSinGrupoResumen } from "./grupos-panel";
import { Alumno, transicionesDisponibles } from "@/domain/entities";
import { RepoDeletionHistory } from "./repo-deletion-history";
import { HistorialDeMembresias } from "./historial-membresias";
import { EstadoAssignmentBadge } from "@/components/EstadoAssignmentBadge";
import { EstadoPanel } from "../estado-panel";

function paginaDeQuery(valor: string | string[] | undefined): number {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const parseado = Number(crudo ?? 1);
  return Number.isInteger(parseado) && parseado > 0 ? parseado : 1;
}

export default async function AssignmentDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{
      repoDeletionPage?: string | string[];
      membresiaPage?: string | string[];
    }>;
  }
) {
  const emptySearchParams: {
    repoDeletionPage?: string | string[];
    membresiaPage?: string | string[];
  } = {};
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams ?? Promise.resolve(emptySearchParams),
  ]);
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const gruposPromise = assignment.cargarGruposCon(getGruposDeAssignment);
  const historyPage = paginaDeQuery(searchParams.repoDeletionPage);
  const membresiaPage = paginaDeQuery(searchParams.membresiaPage);

  const alumnosPromise = getAlumnos();
  const [entregas, alumnos, grupos, total, deletionHistory, historialMembresias] = await Promise.all([
    getEntregas(params.id),
    alumnosPromise,
    gruposPromise,
    assignment.totalEsperado({
      getAlumnosDelCurso: () => alumnosPromise,
      getGruposDeAssignment: (_assignmentId: string) => gruposPromise,
    }),
    getRepoDeletionHistory(params.id, historyPage),
    getHistorialDeMembresias(params.id, membresiaPage),
  ]);

  const aceptadas = entregas.length;
  const pendientes = Math.max(0, total - aceptadas);

  const contextoTransicion = { tieneEntregas: aceptadas > 0 };
  const accionesDeEstado = transicionesDisponibles(
    assignment.estado,
    assignment.id,
    contextoTransicion
  );
  const motivoBloqueoBorrador = assignment.estado.motivoDeBloqueo(
    assignment.id,
    "borrador",
    contextoTransicion
  );

  const alumnosPorUsername = new Map<string, Alumno>(
    alumnos.map((alumno) => [alumno.usernameCanonico, alumno])
  );

  // Reusa las entregas ya cargadas (con `grupo` populado) en vez de una
  // query nueva: qué grupos ya tienen entrega es la razón que justifica
  // bloquear o advertir sobre un cambio de integrantes.
  const gruposConEntrega = new Set(
    entregas.map((entrega) => entrega.grupo?.id).filter((id): id is string => Boolean(id))
  );

  const grupal = assignment.comoGrupal();

  let gruposPanel: React.ReactNode = null;
  if (grupal) {
    const gruposSerializados: GrupoAdminResumen[] = grupos.map((grupo) => ({
      id: grupo.id,
      nombre: grupo.nombre,
      maxIntegrantes: grupo.maxIntegrantes,
      estaLleno: grupo.estaLleno(),
      etiquetaCupo: grupo.etiquetaCupo(),
      tieneEntrega: gruposConEntrega.has(grupo.id),
      miembros: grupo.usernamesDeMiembros().map((username) => ({
        username,
        nombreCompleto:
          alumnosPorUsername.get(Alumno.normalizarUsername(username))?.nombreCompleto ?? username,
      })),
    }));

    const alumnosSinGrupoSerializados: AlumnoSinGrupoResumen[] = grupal
      .alumnosSinGrupo(alumnos, grupos)
      .map((alumno) => ({
        username: alumno.githubUsername,
        nombreCompleto: alumno.nombreCompleto,
      }));

    gruposPanel = (
      <GruposPanel
        assignmentId={params.id}
        inscripcionesCerradas={grupal.inscripcionesCerradas}
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
    provisionEstado: entrega.provisionEstado,
    provisionUltimoError: entrega.provisionUltimoError,
    provisionIntentos: entrega.provisionIntentos,
    estadoRepo: entrega.estadoRepo(),
    createdAt: new Date(entrega.createdAt).toLocaleDateString("es-AR"),
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
          <EstadoAssignmentBadge estado={assignment.estadoNombre} />
        </div>
        <div className="flex items-center gap-3">
          <DeleteReposButton
            assignmentId={assignment.id}
            assignmentSlug={assignment.slug}
            deletionEnabled={assignment.permiteBorrarRepos()}
            activeRepoCount={entregas.filter((entrega) => entrega.hasRepo()).length}
          />
          <Link
            href={`/admin/assignments/${assignment.id}/edit`}
            className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
          >
            Editar
          </Link>
        </div>
      </div>

      <EstadoPanel
        // El estado real es la key: cuando cambia (post router.refresh()),
        // React remonta el panel en vez de arrastrar el estado local
        // optimista que quedó tras la transición anterior.
        key={assignment.estadoNombre}
        assignmentId={assignment.id}
        estado={assignment.estadoNombre}
        accionesDisponibles={accionesDeEstado}
        motivoBloqueoBorrador={motivoBloqueoBorrador}
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
        <EntregasTable assignmentId={assignment.id} entregas={entregaRows} />
      </div>

      <RepoDeletionHistory
        assignmentId={assignment.id}
        history={deletionHistory}
      />

      {grupal && (
        <HistorialDeMembresias
          assignmentId={assignment.id}
          historial={historialMembresias}
          repoDeletionPage={historyPage}
        />
      )}

      {gruposPanel}
    </div>
  );
}
