import type { PermisoDePlanilla } from "@/infrastructure/sheets";

export type DiagnosticoDePlanilla = { ok: boolean; detalle: string };

// Traduce el permiso de la service account sobre la planilla de la comisión
// activa a un check de `/admin/operaciones` (issue #95). Con rol Viewer la
// lectura anda pero el registro (`POST /api/registro`) falla al escribir; el
// tablero tiene que decir a quién compartir y con qué rol.
export function evaluarPermisoDePlanilla(permiso: PermisoDePlanilla): DiagnosticoDePlanilla {
  if (permiso.puedeEditar) {
    return { ok: true, detalle: `Escritura habilitada para ${permiso.clientEmail}` };
  }
  return {
    ok: false,
    detalle: `La service account ${permiso.clientEmail} sólo puede leer la planilla: compartirla como Editor (Compartir → rol Editor)`,
  };
}
