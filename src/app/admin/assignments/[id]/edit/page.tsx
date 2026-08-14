import { requireAdmin } from "@/lib/session";
import { getAssignment } from "@/lib/repositories";
import { listarTemplates } from "@/lib/github";
import { redirect } from "next/navigation";
import { AssignmentForm } from "../../assignment-form";
import { actualizarAssignment } from "../../actions";
import { EstadoAssignmentBadge } from "@/app/components/EstadoAssignmentBadge";
export default async function EditAssignmentPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const templates = await listarTemplates();

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Editar Assignment</h1>
        <EstadoAssignmentBadge estado={assignment.estadoNombre} />
      </div>
      <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Comisión:{" "}
        <span className="font-medium text-gray-800">
          {assignment.comision
            ? `${assignment.comision.anio} (${assignment.comision.activa ? "Activa" : "Histórica"})`
            : "Sin comisión"}
        </span>
        {" · "}
        El estado se cambia desde el detalle del assignment, no en este formulario.
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
      />
    </div>
  );
}
