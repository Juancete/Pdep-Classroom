import { requireAdmin } from "@/lib/session";
import {
  getComision,
  countAlumnos,
  getAlumnosConGruposSyncPendiente,
  getSuscripcionesPendientesDeComision,
} from "@/lib/repositories";
import type { Alumno } from "@/domain/entities";
import { getAlumnos, getSheetNames } from "@/lib/sheets";
import { redirect } from "next/navigation";
import { ComisionForm } from "../../comision-form";
import { actualizarComision } from "../../actions";
import { SyncButton } from "../../sync-button";
import { SyncGruposButton } from "../../sync-grupos-button";
import { SyncCanalesButton } from "../../sync-canales-button";
import { canalesActivos, canalPorNombre } from "@/lib/canales";

export default async function EditComisionPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await requireAdmin();

  const comision = await getComision(params.id);
  if (!comision) redirect("/admin/comisiones");

  // Comparar counts en paralelo; si alguno falla no rompemos la página
  const nombresDeCanalesActivos = canalesActivos().map((canal) => canal.nombre);
  const [
    countSheet,
    countDB,
    pendientesGrupos,
    suscripcionesPendientes,
    sheetNames,
  ] = await Promise.all([
    getAlumnos(comision.spreadsheetId, comision.columnConfig)
      .then((alumnos) => alumnos.length)
      .catch(() => null),
    countAlumnos(comision.id).catch(() => null),
    getAlumnosConGruposSyncPendiente(comision.id).catch(() => [] as unknown[]),
    nombresDeCanalesActivos.length > 0
      ? getSuscripcionesPendientesDeComision(comision.id, nombresDeCanalesActivos).catch(
          () => []
        )
      : Promise.resolve([]),
    getSheetNames(comision.spreadsheetId).catch(() => null),
  ]);

  const desynced =
    countSheet !== null && countDB !== null && countSheet !== countDB;
  const cantPendientesGrupos = pendientesGrupos.length;
  const cantSuscripcionesPendientes = suscripcionesPendientes.length;

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
        {!comision.gruposYaImportados() && (comision.columnConfig?.grupos || cantPendientesGrupos > 0) && (
          <>
            <span
              title="La planilla se usa una sola vez como bootstrap; después Classroom es la fuente de verdad"
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {cantPendientesGrupos > 0
                ? `Grupos pendientes · ${cantPendientesGrupos}`
                : "Bootstrap de grupos pendiente"}
            </span>
            <SyncGruposButton comisionId={comision.id} />
          </>
        )}
        {comision.gruposImportadosEn && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Grupos importados · {comision.gruposImportadosEn.toLocaleDateString("es-AR")}
          </span>
        )}
        {cantSuscripcionesPendientes > 0 && (
          <>
            <span
              title="Alumnos cuya suscripción a un canal de comunicación requiere reintento"
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Suscripciones pendientes · {cantSuscripcionesPendientes}
            </span>
            <SyncCanalesButton comisionId={comision.id} />
          </>
        )}
      </div>

      {!comision.gruposYaImportados() && cantPendientesGrupos > 0 && (
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

      {cantSuscripcionesPendientes > 0 && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
          data-testid="pendientes-canales-lista"
        >
          <p className="text-xs font-semibold text-red-700 mb-2">
            Alumnos con suscripciones a canales de comunicación pendientes:
          </p>
          <ul className="space-y-1">
            {suscripcionesPendientes.map((suscripcion) => (
              <li
                key={`${suscripcion.alumno.githubUsername}-${suscripcion.canal}`}
                className="text-xs text-red-700"
              >
                {suscripcion.alumno.nombreCompleto}{" "}
                <span className="text-red-400">
                  @{suscripcion.alumno.githubUsername}
                </span>{" "}
                <span className="text-red-400">
                  · {canalPorNombre(suscripcion.canal)?.etiqueta ?? suscripcion.canal}
                </span>
                {suscripcion.ultimoIntentoEn && (
                  <span className="text-red-400">
                    {" "}
                    · último intento{" "}
                    {suscripcion.ultimoIntentoEn.toLocaleString("es-AR")}
                  </span>
                )}
                {suscripcion.ultimoError && (
                  <span className="block text-red-600">{suscripcion.ultimoError}</span>
                )}
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
