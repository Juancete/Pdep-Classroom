import { requireAdmin } from "@/infrastructure/auth/session";
import { getAssignment, getEntregaCountsByAssignment } from "@/infrastructure/repositories";
import { listarTemplates } from "@/infrastructure/github";
import { redirect } from "next/navigation";
import { AssignmentForm } from "../../assignment-form";
import { actualizarAssignment } from "../../actions";
import { transicionesDisponibles } from "@/domain/entities";
import { EstadoPanel } from "../../estado-panel";
export default async function EditAssignmentPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const [templates, entregasCounts] = await Promise.all([
    listarTemplates(),
    getEntregaCountsByAssignment(),
  ]);
  const aceptadas = entregasCounts.get(assignment.id) ?? 0;
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

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Editar Assignment</h1>

      <EstadoPanel
        // Ver comentario homólogo en admin/assignments/[id]/page.tsx.
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

      <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Comisión:{" "}
        <span className="font-medium text-gray-800">
          {assignment.comision
            ? `${assignment.comision.anio} (${assignment.comision.activa ? "Activa" : "Histórica"})`
            : "Sin comisión"}
        </span>
      </div>
      <AssignmentForm
        action={actualizarAssignment}
        templates={templates}
        defaultValues={{
          id: assignment.id,
          titulo: assignment.titulo,
          slug: assignment.slug,
          descripcion: assignment.descripcion,
          templateRepo: assignment.templateRepo,
          tipo: assignment.tipo,
          paradigma: assignment.paradigma,
          deadline: assignment.deadline?.toISOString().slice(0, 10),
          ...assignment.extraFormDefaults(),
        }}
        submitLabel="Guardar cambios"
        structuralLocked={!assignment.permiteEditarEstructura()}
      />
    </div>
  );
}
