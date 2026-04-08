import { requireUser } from "@/lib/session";
import { getAssignments, getEntregaDeUsuario } from "@/lib/store";
import { getAlumnoByGithub } from "@/lib/sheets";
import { AcceptButton } from "./accept-button";
import { redirect } from "next/navigation";
import type { Assignment, Entrega } from "@/types";

export default async function DashboardPage() {
  const user = await requireUser();

  // Si no es admin y no está registrado, mandar a registro
  if (!user.isAdmin) {
    const alumno = await getAlumnoByGithub(user.githubUsername);
    if (!alumno) redirect("/registro");
  }

  const assignments = await getAssignments();

  // Para cada assignment, buscar si ya tiene entrega
  const assignmentsConEntrega: {
    assignment: Assignment;
    entrega: Entrega | undefined;
  }[] = await Promise.all(
    assignments
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map(async (assignment) => ({
        assignment,
        entrega: await getEntregaDeUsuario(
          assignment.id,
          user.githubUsername
        ),
      }))
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
          {assignmentsConEntrega.map(({ assignment, entrega }) => (
            <div
              key={assignment.id}
              className="bg-white border border-gray-200 rounded-lg p-5 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
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
              </div>

              <div className="flex-shrink-0 ml-4">
                {entrega ? (
                  <a
                    href={entrega.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg font-medium hover:bg-green-100 transition-colors"
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
