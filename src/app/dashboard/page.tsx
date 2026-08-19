import { requireUser } from "@/lib/session";
import {
  getAssignments,
  getAssignmentsDeComision,
  getEntregasDeUsuario,
  getAlumnoByGithub,
  getComisionActiva,
  getGruposDeAlumno,
} from "@/lib/repositories";
import { AcceptButton } from "./accept-button";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Grupo } from "@/domain/entities";
import { EstadoAssignmentBadge } from "@/app/components/EstadoAssignmentBadge";
import { AutogradingBadge } from "@/app/components/AutogradingBadge";
import { AutogradingRefreshButton } from "./autograding-refresh-button";

export default async function DashboardPage() {
  const user = await requireUser();
  const puedeAdministrar = user.rol.puedeAdministrar();
  let comisionActivaId: string | null = null;

  if (!puedeAdministrar) {
    const [alumno, comisionActiva] = await Promise.all([
      getAlumnoByGithub(user.githubUsername),
      getComisionActiva(),
    ]);
    comisionActivaId = comisionActiva?.id ?? null;
    if (comisionActiva && (!alumno || alumno.necesitaConfirmarRegistroPara(comisionActiva))) {
      redirect("/registro");
    }
  }

  const gruposPromise: Promise<Map<string, Grupo>> = puedeAdministrar
    ? Promise.resolve(new Map())
    : getGruposDeAlumno(user.githubUsername);

  const [assignments, entregasMap, gruposMap] = await Promise.all([
    puedeAdministrar
      ? getAssignments()
      : comisionActivaId
        ? getAssignmentsDeComision(comisionActivaId)
        : Promise.resolve([]),
    getEntregasDeUsuario(user.githubUsername),
    gruposPromise,
  ]);

  const assignmentsConEntrega = assignments
    .sort((prev, next) => new Date(next.createdAt).getTime() - new Date(prev.createdAt).getTime())
    .map((assignment) => ({
      assignment,
      entrega: entregasMap.get(assignment.id) ?? null,
      grupo: gruposMap.get(assignment.id) ?? null,
    }))
    // Filtro fino de estado, del lado del alumno: la query de
    // getAssignmentsDeComision ya excluye los borradores; acá se resuelve
    // "un archivado solo se ve si ya tenés entrega" (decisión de negocio que
    // depende de datos por-alumno, no solo del estado). El admin ve todo.
    .filter(
      ({ assignment, entrega }) =>
        puedeAdministrar || assignment.esVisibleParaAlumno(entrega !== null)
    );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Mis Trabajos Prácticos</h1>
      <p className="text-gray-500 mb-6">
        Hola <span className="font-mono">{user.githubUsername}</span> — acá
        podés aceptar los TPs y acceder a tus repos.
      </p>

      {assignmentsConEntrega.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No hay assignments publicados todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {assignmentsConEntrega.map(({ assignment, entrega, grupo }) => (
            <div
              key={assignment.id}
              className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-semibold">{assignment.titulo}</h3>
                  <span className="text-xs bg-pdep-100 text-pdep-700 px-2 py-0.5 rounded-full font-medium">
                    {assignment.paradigma}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {assignment.tipo}
                  </span>
                  {assignment.estadoNombre !== "publicado" && (
                    <EstadoAssignmentBadge estado={assignment.estadoNombre} />
                  )}
                </div>
                {assignment.descripcion && (
                  <p className="text-sm text-gray-500">
                    {assignment.descripcion}
                  </p>
                )}
                {assignment.deadline && (
                  <p className="text-xs text-gray-400 mt-1">
                    Entrega:{" "}
                    {new Date(assignment.deadline).toLocaleDateString("es-AR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                )}
                {grupo && !entrega && (
                  <p className="text-xs text-gray-500 mt-1">
                    Grupo:{" "}
                    <Link
                      href={`/assignments/${assignment.id}/grupo`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {grupo.nombre}
                    </Link>
                  </p>
                )}
              </div>

              <div className="flex-shrink-0 w-full sm:w-auto flex flex-col items-end gap-1.5">
                {entrega ? (
                  <a
                    href={entrega.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-lg font-medium hover:bg-green-100 transition-colors w-full sm:w-auto"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    Ir al repo
                  </a>
                ) : assignment.requiereSeleccionDeGrupo(user, grupo) ? (
                  <a
                    href={`/assignments/${assignment.id}/grupo`}
                    className="inline-flex items-center justify-center gap-1.5 text-sm bg-pdep-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-pdep-700 transition-colors w-full sm:w-auto"
                    data-testid="elegir-grupo-link"
                  >
                    Elegir grupo
                  </a>
                ) : (
                  <AcceptButton assignmentId={assignment.id} />
                )}
                {entrega && (
                  <div className="flex items-center gap-1">
                    <AutogradingBadge
                      resultadoNombre={entrega.autogradingResultadoNombre}
                      runUrl={entrega.autogradingRunUrl}
                    />
                    <AutogradingRefreshButton assignmentId={assignment.id} />
                  </div>
                )}
                {entrega && entrega.autogradingResultadoNombre !== "sin_autograding" && (
                  <p className="text-[11px] text-gray-400">
                    Resultado automático — no es la nota final.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
