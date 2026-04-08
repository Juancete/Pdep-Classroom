import { requireAdmin } from "@/lib/session";
import { getAssignment, updateAssignment } from "@/lib/store";
import { listarTemplates } from "@/lib/github";
import { redirect } from "next/navigation";
import { PARADIGMAS } from "@/types";

export default async function EditAssignmentPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) {
    redirect("/admin/assignments");
    return null;
  }

  let templates: { name: string; fullName: string; description: string }[] = [];
  try {
    templates = await listarTemplates();
  } catch {
    // Sin credenciales: permite ingresar manualmente
  }

  async function actualizar(formData: FormData) {
    "use server";
    await requireAdmin();

    const titulo = formData.get("titulo") as string;
    const slug =
      (formData.get("slug") as string) ||
      titulo
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    await updateAssignment(params.id, {
      titulo,
      slug,
      descripcion: (formData.get("descripcion") as string) || "",
      templateRepo: formData.get("templateRepo") as string,
      tipo: (formData.get("tipo") as "individual" | "grupal") || "individual",
      paradigma:
        (formData.get("paradigma") as "funcional" | "logico" | "objetos") ||
        "funcional",
      deadline: (formData.get("deadline") as string) || "",
    });

    redirect("/admin/assignments");
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Editar Assignment</h1>

      <form action={actualizar} className="space-y-5">
        {/* Título */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Título
          </label>
          <input
            name="titulo"
            required
            defaultValue={assignment.titulo}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Slug{" "}
            <span className="font-normal text-gray-400">
              (nombre base del repo)
            </span>
          </label>
          <input
            name="slug"
            defaultValue={assignment.slug}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            name="descripcion"
            rows={2}
            defaultValue={assignment.descripcion}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
          />
        </div>

        {/* Template repo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template Repo
          </label>
          {templates.length > 0 ? (
            <select
              name="templateRepo"
              required
              defaultValue={assignment.templateRepo}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
            >
              <option value="">Elegí un template…</option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                  {t.description ? ` — ${t.description}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              name="templateRepo"
              required
              defaultValue={assignment.templateRepo}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
            />
          )}
        </div>

        {/* Paradigma y Tipo en fila */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Paradigma
            </label>
            <select
              name="paradigma"
              required
              defaultValue={assignment.paradigma}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
            >
              {PARADIGMAS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <select
              name="tipo"
              required
              defaultValue={assignment.tipo}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
            >
              <option value="individual">Individual</option>
              <option value="grupal">Grupal</option>
            </select>
          </div>
        </div>

        {/* Deadline */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Deadline
          </label>
          <input
            name="deadline"
            type="date"
            defaultValue={assignment.deadline}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="bg-pdep-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors"
          >
            Guardar cambios
          </button>
          <a
            href="/admin/assignments"
            className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  );
}
