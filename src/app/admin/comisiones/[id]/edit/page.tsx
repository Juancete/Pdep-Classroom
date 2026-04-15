import { requireAdmin } from "@/lib/session";
import { getComision, countAlumnos } from "@/lib/repositories";
import { getAlumnos } from "@/lib/sheets";
import { redirect } from "next/navigation";
import { ComisionForm } from "../../comision-form";
import { actualizarComision } from "../../actions";
import { SyncButton } from "../../sync-button";

export default async function EditComisionPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const comision = await getComision(params.id);
  if (!comision) redirect("/admin/comisiones");

  // Comparar counts en paralelo; si alguno falla no rompemos la página
  const [countSheet, countDB] = await Promise.all([
    getAlumnos(comision.spreadsheetId, comision.columnConfig)
      .then((a) => a.length)
      .catch(() => null),
    countAlumnos().catch(() => null),
  ]);

  const desynced =
    countSheet !== null && countDB !== null && countSheet !== countDB;

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Editar Comisión {comision.anio}</h1>
        {desynced && (
          <>
            <span
              title={`Planilla: ${countSheet} alumnos — Base de datos: ${countDB} alumnos`}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Desincronizado · {countSheet} en planilla / {countDB} en DB
            </span>
            <SyncButton comisionId={comision.id} />
          </>
        )}
      </div>

      <ComisionForm
        action={actualizarComision}
        defaultValues={{
          id: comision.id,
          anio: comision.anio,
          spreadsheetId: comision.spreadsheetId,
          activa: comision.activa,
          columnConfig: comision.columnConfig,
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
