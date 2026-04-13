import { requireAdmin } from "@/lib/session";
import { getComision } from "@/lib/repositories";
import { redirect } from "next/navigation";
import { ComisionForm } from "../../comision-form";
import { actualizarComision } from "../../actions";

export default async function EditComisionPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const comision = await getComision(params.id);
  if (!comision) redirect("/admin/comisiones");

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Editar Comisión {comision.anio}</h1>
      <ComisionForm
        action={actualizarComision}
        defaultValues={{
          id: comision.id,
          anio: comision.anio,
          spreadsheetId: comision.spreadsheetId,
          activa: comision.activa,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
