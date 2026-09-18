import { redirect } from "next/navigation";
import { requireAdmin } from "@/infrastructure/auth/session";
import { listarTemplates } from "@/infrastructure/github";
import { obtenerContextoDeComision } from "@/application/comisionConsultada";
import { AssignmentForm } from "../assignment-form";
import { crearAssignment } from "../actions";

export default async function NewAssignmentPage() {
  await requireAdmin();

  // issue #114: `createAssignment` siempre crea en la activa — consultando
  // una histórica no hay a dónde crear. El listado ya oculta el link, esto
  // cubre la entrada directa por URL.
  const { contexto } = await obtenerContextoDeComision();
  const comisionActiva = contexto.comisionActiva();
  if (!contexto.permiteCrearAssignments() || !comisionActiva) {
    redirect("/admin/assignments");
  }

  const templates = await listarTemplates();

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Nuevo Assignment</h1>
      <p className="text-gray-500 text-sm mb-6">
        Se creará en la comisión {comisionActiva.anio} (activa).
      </p>
      <AssignmentForm
        action={crearAssignment}
        templates={templates}
        submitLabel="Crear Assignment"
      />
    </div>
  );
}
