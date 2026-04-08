import { requireAdmin } from "@/lib/session";
import { listarTemplates } from "@/lib/github";
import { AssignmentForm } from "../assignment-form";
import { crearAssignment } from "../actions";

export default async function NewAssignmentPage() {
  await requireAdmin();

  let templates: { name: string; fullName: string; description: string }[] = [];
  try {
    templates = await listarTemplates();
  } catch {
    // Sin credenciales: permite ingresar manualmente
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Nuevo Assignment</h1>
      <AssignmentForm
        action={crearAssignment}
        templates={templates}
        submitLabel="Crear Assignment"
      />
    </div>
  );
}
