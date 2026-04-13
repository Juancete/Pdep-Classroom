import { requireAdmin } from "@/lib/session";
import { getAssignment } from "@/lib/repositories";
import { listarTemplates } from "@/lib/github";
import { redirect } from "next/navigation";
import { AssignmentForm } from "../../assignment-form";
import { actualizarAssignment } from "../../actions";

export default async function EditAssignmentPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");

  const templates = await listarTemplates();

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Editar Assignment</h1>
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
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
