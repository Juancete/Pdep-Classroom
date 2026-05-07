import { requireUser } from "@/lib/session";
import {
  getAssignments,
  getEntregasDeUsuario,
  getAlumnoByGithub,
  getComisionActiva,
  getGruposDeAlumno,
} from "@/lib/repositories";
import { AcceptButton } from "./accept-button";
import { redirect } from "next/navigation";
import type { Grupo } from "@/domain/entities";

export default async function DashboardPage() {
  const user = await requireUser();

  if (!user.isAdmin) {
    const [alumno, comisionActiva] = await Promise.all([
      getAlumnoByGithub(user.githubUsername),
      getComisionActiva(),
    ]);
    if (
      comisionActiva &&
      alumno?.registroConfirmadoEn?.id !== comisionActiva.id
    ) {
      redirect("/registro");
    }
  }

  const gruposPromise: Promise<Map<string, Grupo>> = user.isAdmin
    ? Promise.resolve(new Map())
    : getGruposDeAlumno(user.githubUsername);

  const [assignments, entregasMap, gruposMap] = await Promise.all([
    getAssignments(),
    getEntregasDeUsuario(user.githubUsername),
    gruposPromise,
  ]);

  const assignmentsConEntrega = assignments
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((assignment) => ({
      assignment,
      entrega: entregasMap.get(assignment.id) ?? null,
      grupo: gruposMap.get(assignment.id) ?? null,
    }));

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
                  <p className="text-xs text-blue-600 mt-1">
                    Grupo: <span className="font-medium">{grupo.nombre}</span>
                  </p>
                )}
              </div>

              <div className="flex-shrink-0 w-full sm:w-auto">
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
                ) : assignment.tipo === "grupal" && !grupo ? (
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
