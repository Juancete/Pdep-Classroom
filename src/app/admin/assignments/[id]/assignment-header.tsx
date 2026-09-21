import Link from "next/link";
import type { Assignment } from "@/domain/entities";
import { EstadoAssignmentBadge } from "@/components/EstadoAssignmentBadge";
import { EtiquetaDeComision } from "@/components/EtiquetaDeComision";

export type PestanaDeAssignment = "detalle" | "grupos" | "integrantes" | "repos";

export function AssignmentHeader({
  assignment,
  activa,
  acciones,
}: {
  assignment: Assignment;
  activa: PestanaDeAssignment;
  acciones?: React.ReactNode;
}) {
  const base = `/admin/assignments/${assignment.id}`;
  const esGrupal = assignment.comoGrupal() !== null;
  const pestanas: { clave: PestanaDeAssignment; etiqueta: string; href: string; visible: boolean }[] = [
    { clave: "detalle", etiqueta: "Detalle", href: base, visible: true },
    { clave: "grupos", etiqueta: "Grupos", href: `${base}/grupos`, visible: esGrupal },
    {
      clave: "integrantes",
      etiqueta: "Integrantes",
      href: `${base}/historial-integrantes`,
      visible: esGrupal,
    },
    { clave: "repos", etiqueta: "Repos borrados", href: `${base}/historial-repos`, visible: true },
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/assignments"
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Volver
          </Link>
          <h1 className="text-2xl font-bold">{assignment.titulo}</h1>
          <EstadoAssignmentBadge estado={assignment.estadoNombre} />
          {/* issue #114: la barra de comisión consultada no llega hasta acá
              (sólo vive en las tres listas) — sin esto, el detalle de un TP
              no indicaba a qué comisión pertenece. */}
          <EtiquetaDeComision comision={assignment.comision} />
        </div>
        <div className="flex items-center gap-3">
          {acciones}
          <Link
            href={`${base}/edit`}
            className="bg-pdep-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
          >
            Editar
          </Link>
        </div>
      </div>

      <nav aria-label="Secciones del assignment" className="flex gap-6 border-b border-gray-200">
        {pestanas
          .filter((pestana) => pestana.visible)
          .map((pestana) => {
            const esActiva = pestana.clave === activa;
            return (
              <Link
                key={pestana.clave}
                href={pestana.href}
                aria-current={esActiva ? "page" : undefined}
                className={`-mb-px border-b-2 pb-2 text-sm font-medium ${
                  esActiva
                    ? "border-pdep-600 text-pdep-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {pestana.etiqueta}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
