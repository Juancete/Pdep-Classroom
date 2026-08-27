import { requireAdmin } from "@/lib/session";
import { getComisionActiva, getWebhookDeliveryOverview } from "@/lib/repositories";
import { listarTemplates } from "@/lib/github";
import { getSheetNames } from "@/lib/sheets";
import { CANALES_DE_COMUNICACION } from "@/lib/canales";
import { ReprocessWebhookButton } from "./reprocess-button";

type Check = { nombre: string; ok: boolean; detalle: string };

export default async function OperacionesPage() {
  await requireAdmin();
  const overview = await getWebhookDeliveryOverview();
  const comision = await getComisionActiva();
  const [github, sheets] = await Promise.all([
    listarTemplates().then((items) => ({ ok: true, detalle: `${items.length} templates accesibles` })).catch((error) => ({ ok: false, detalle: (error as Error).message })),
    comision
      ? getSheetNames(comision.spreadsheetId).then((items) => ({ ok: true, detalle: `${items.length} hojas accesibles` })).catch((error) => ({ ok: false, detalle: (error as Error).message }))
      : Promise.resolve({ ok: false, detalle: "No hay comisión activa" }),
  ]);
  const checks: Check[] = [
    { nombre: "Base de datos", ok: true, detalle: "Consulta administrativa correcta" },
    { nombre: "GitHub App", ...github },
    { nombre: "Google Sheets", ...sheets },
    ...CANALES_DE_COMUNICACION.map((canal) => {
      const configurado = canal.estaConfigurado();
      return {
        nombre: canal.etiqueta,
        ok: configurado,
        detalle: configurado ? "Configuración presente" : "Integración desactivada o incompleta",
      };
    }),
    { nombre: "Webhook", ok: Boolean(process.env.GITHUB_WEBHOOK_SECRET), detalle: overview.ultimoRecibidoEn ? `Último delivery: ${overview.ultimoRecibidoEn.toLocaleString("es-AR")}` : "Todavía no se recibió ningún delivery" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tablero de diagnóstico</h1>
          <p className="text-sm text-gray-500">Diagnóstico de integraciones y deliveries recientes.</p>
        </div>
        {(overview.pendientes > 0 || overview.fallidos > 0) && <ReprocessWebhookButton />}
      </div>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <div key={check.nombre} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className={`text-sm font-semibold ${check.ok ? "text-green-700" : "text-red-700"}`}>{check.ok ? "OK" : "Revisar"} · {check.nombre}</div>
            <div className="mt-1 break-words text-xs text-gray-500">{check.detalle}</div>
          </div>
        ))}
      </div>
      <h2 className="mb-3 text-lg font-semibold">Webhook deliveries</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="p-3">Recibido</th><th className="p-3">Evento</th><th className="p-3">Repo</th><th className="p-3">Estado</th><th className="p-3">Error</th><th className="p-3">Acción</th></tr></thead>
          <tbody>
            {overview.items.map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="p-3 text-xs text-gray-500">{item.recibidoEn.toLocaleString("es-AR")}</td>
                <td className="p-3 font-mono text-xs">{item.evento}{item.accion ? `.${item.accion}` : ""}</td>
                <td className="p-3 font-mono text-xs">{item.repoName ?? "—"}</td>
                <td className="p-3">{item.estadoProcesamiento} · {item.intentos} intento(s)</td>
                <td className="max-w-md break-words p-3 text-xs text-red-700">{item.error ?? "—"}</td>
                <td className="p-3">{["fallido", "recibido"].includes(item.estadoProcesamiento) ? <ReprocessWebhookButton deliveryId={item.deliveryId} /> : "—"}</td>
              </tr>
            ))}
            {overview.items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-500">Todavía no hay deliveries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
