import { requireUser } from "@/infrastructure/auth/session";
import {
  getAssignmentsDeComision,
  getEntregasDeUsuario,
  getEntregasDeGrupos,
  getComisionActiva,
  getGruposDeAlumno,
} from "@/infrastructure/repositories";
import { AcceptButton } from "./accept-button";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EstadoAssignmentBadge } from "@/components/EstadoAssignmentBadge";
import { CIBadge } from "@/components/CIBadge";
import { CIRefreshButton } from "./ci-refresh-button";
import { ListaDeIntegrantes } from "@/components/ListaDeIntegrantes";
import { resolverParticipante } from "@/application/participante";
import type { Entrega } from "@/domain/entities";

export default async function DashboardPage() {
  const user = await requireUser();
  const [participante, comisionActiva] = await Promise.all([
    resolverParticipante(user),
    getComisionActiva(),
  ]);

  // Mismo predicado para todos los roles, resuelto por el `Participante`: un
  // docente nunca lo necesita (issue #107/#112) — se registra sólo el
  // alumno, y sólo si hay comisión activa y todavía no confirmó en ella.
  if (participante.necesitaRegistro(comisionActiva)) redirect("/registro");

  const [assignments, entregasMap, gruposMap, entregasPorGrupo] = await Promise.all([
    comisionActiva ? getAssignmentsDeComision(comisionActiva.id) : Promise.resolve([]),
    getEntregasDeUsuario(participante.githubUsername),
    getGruposDeAlumno(participante.githubUsername),
    comisionActiva
      ? getEntregasDeGrupos({ comisionId: comisionActiva.id })
      : Promise.resolve(new Map<string, Entrega>()),
  ]);

  const assignmentsConEntrega = assignments
    .sort((prev, next) => new Date(next.createdAt).getTime() - new Date(prev.createdAt).getTime())
    .map((assignment) => {
      const grupo = gruposMap.get(assignment.id) ?? null;
      return {
        assignment,
        entrega: entregasMap.get(assignment.id) ?? null,
        grupo,
        // `getEntregasDeUsuario` filtra por `perteneceA(username)`, así que
        // un integrante que se sumó al grupo después de creado el repo
        // (issue #123) no tiene `entrega` propia aunque el grupo sí — la
        // tarjeta necesita la entrega DEL GRUPO para poder mostrarle a
        // todos quién tiene acceso (issue #138). La `entrega` del usuario,
        // arriba, sigue gobernando la columna de acciones ("Ir al
        // repo"/`AcceptButton`) sin cambios.
        entregaDelGrupo: grupo ? entregasPorGrupo.get(grupo.id) ?? null : null,
      };
    })
    // Mis TPs es la vista del alumno para todos (issue #107/#112): publicado
    // siempre, archivado sólo si ya tenés entrega — sin ningún `if` de rol.
    .filter(({ assignment, entrega }) => assignment.esVisibleParaAlumno(entrega !== null));

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
          {assignmentsConEntrega.map(({ assignment, entrega, grupo, entregaDelGrupo }) => {
            const puedeActuar = assignment.permiteAccionesDeAlumno();
            return (
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
                    {!puedeActuar && (
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
                  {grupo && (
                    <>
                      {/* La página de grupo exige `permiteAccionesDeAlumno()`
                          (`autorizarAccionSobreAssignment`) y responde 404 en
                          un TP archivado, así que en ese caso el nombre va
                          sin link. */}
                      <p className="text-xs text-gray-500 mt-1">
                        Grupo:{" "}
                        {puedeActuar ? (
                          <Link
                            href={`/assignments/${assignment.id}/grupo`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {grupo.nombre}
                          </Link>
                        ) : (
                          <span className="font-medium">{grupo.nombre}</span>
                        )}
                      </p>
                      <div className="mt-1.5">
                        <ListaDeIntegrantes
                          integrantes={grupo.resumenDeIntegrantes(entregaDelGrupo)}
                          tieneRepo={entregaDelGrupo?.hasRepo() ?? false}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex-shrink-0 w-full sm:w-auto flex flex-col items-end gap-1.5">
                  {entrega?.hasRepo() ? (
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
                  ) : entrega ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-amber-700">
                        {puedeActuar
                          ? entrega.provisionEstado === "fallida"
                            ? "No se pudo crear el repo. Podés reintentar."
                            : "Estamos creando el repositorio."
                          : entrega.provisionEstado === "fallida"
                            ? "No se pudo crear el repo antes de archivar el TP. Consultá al equipo docente."
                            : "La creación del repo quedó pendiente antes de archivar el TP."}
                      </span>
                      {puedeActuar && <AcceptButton assignmentId={assignment.id} />}
                    </div>
                  ) : puedeActuar ? (
                    assignment.requiereSeleccionDeGrupo(grupo) ? (
                      <a
                        href={`/assignments/${assignment.id}/grupo`}
                        className="inline-flex items-center justify-center gap-1.5 text-sm bg-pdep-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-pdep-700 transition-colors w-full sm:w-auto"
                        data-testid="elegir-grupo-link"
                      >
                        Elegir grupo
                      </a>
                    ) : (
                      <AcceptButton assignmentId={assignment.id} />
                    )
                  ) : null}
                  {entrega?.hasRepo() && (
                    <div className="flex items-center gap-1">
                      <CIBadge
                        resultadoNombre={entrega.ciResultadoNombre}
                        detalleUrl={entrega.ciDetalleUrl}
                      />
                      <CIRefreshButton assignmentId={assignment.id} />
                    </div>
                  )}
                  {entrega?.hasRepo() && entrega.ciResultadoNombre !== "sin_ci" && (
                    <p className="text-[11px] text-gray-400">
                      Resultado automático — no es la nota final.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
