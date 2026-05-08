import { requireAdmin } from "@/lib/session";
import {
  getComision,
  countAlumnos,
  getAlumnosConGruposSyncPendiente,
} from "@/lib/repositories";
import type { Alumno } from "@/domain/entities";
import { getAlumnos, getSheetNames } from "@/lib/sheets";
import { redirect } from "next/navigation";
import { ComisionForm } from "../../comision-form";
import { actualizarComision } from "../../actions";
import { SyncButton } from "../../sync-button";
import { SyncGruposButton } from "../../sync-grupos-button";

export default async function EditComisionPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();

  const comision = await getComision(params.id);
  if (!comision) redirect("/admin/comisiones");

  // Comparar counts en paralelo; si alguno falla no rompemos la página
  const [countSheet, countDB, pendientesGrupos, sheetNames] = await Promise.all([
    getAlumnos(comision.spreadsheetId, comision.columnConfig)
      .then((alumnos) => alumnos.length)
      .catch(() => null),
    countAlumnos().catch(() => null),
    getAlumnosConGruposSyncPendiente(comision.id).catch(() => [] as unknown[]),
    getSheetNames(comision.spreadsheetId).catch(() => null),
  ]);

  const desynced =
    countSheet !== null && countDB !== null && countSheet !== countDB;
  const cantPendientesGrupos = pendientesGrupos.length;

  return (
    <div className="max-w-xl">
      <div className="flex flex-wrap items-center gap-3 mb-6">
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
        {cantPendientesGrupos > 0 && (
          <>
            <span
              title="Alumnos cuyo último intento de sincronizar grupos desde la planilla falló"
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Grupos pendientes · {cantPendientesGrupos}
            </span>
            <SyncGruposButton comisionId={comision.id} />
          </>
        )}
      </div>

      {cantPendientesGrupos > 0 && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
          data-testid="pendientes-grupos-lista"
        >
          <p className="text-xs font-semibold text-red-700 mb-2">
            Alumnos con sync de grupos pendiente:
          </p>
          <ul className="space-y-0.5">
            {(pendientesGrupos as Alumno[]).map((alumno) => (
              <li key={alumno.githubUsername} className="text-xs text-red-700">
                {alumno.nombreCompleto}{" "}
                <span className="text-red-400">@{alumno.githubUsername}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ComisionForm
        action={actualizarComision}
        defaultValues={{
          id: comision.id,
          anio: comision.anio,
          spreadsheetId: comision.spreadsheetId,
          activa: comision.activa,
          columnConfig: comision.columnConfig,
        }}
        initialSheetNames={sheetNames ?? undefined}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
