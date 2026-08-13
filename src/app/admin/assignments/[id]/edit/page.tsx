import { requireAdmin } from "@/lib/session";
import { getAssignment } from "@/lib/repositories";
import { listarTemplates } from "@/lib/github";
import { redirect } from "next/navigation";
import { AssignmentForm } from "../../assignment-form";
import { actualizarAssignment } from "../../actions";
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
      <h1 className="text-2xl font-bold mb-6">Editar Assignment</h1>
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
      />
    </div>
  );
}
