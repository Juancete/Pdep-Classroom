"use client";

import "./globals.css";
import { ErrorPage } from "@/components/ErrorPage";

// Cubre errores del propio root layout: `layout.tsx` renderiza `<Nav />` y
// `<SyncPendingBanner />`, que llaman a `getCurrentUser()`, y esa consulta
// puede lanzar `PermisosNoVerificablesError` (fail hard, decisión
// deliberada del proyecto — no degradar el rol). Un error ahí nace por
// encima del root layout, así que el error boundary de segmento
// `error.tsx` no lo cubre; sin este archivo, Next muestra su pantalla
// genérica. Next exige que un `global-error.tsx` incluya `<html>/<body>`
// porque reemplaza al layout entero mientras está activo.
//
// La política de qué mensaje mostrar (y cuándo) vive en `ErrorPage`, la
// misma que usa `error.tsx` — acá sólo queda el markup propio del boundary
// de root (`<html>/<body>`) y el botón de reintento.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es">
      <body className="font-sans">
        <ErrorPage error={error} />
        <div className="text-center mt-4">
          {/* `retry` (no `reset`) porque además de limpiar el estado del
              boundary vuelve a pedir los datos del router (`router.refresh()`
              vía `startTransition`) — con sólo `reset` una falla temporal
              (ej. de permisos) seguía mostrando el mismo error aunque la
              causa ya se hubiera resuelto. */}
          <button
            type="button"
            onClick={retry}
            className="bg-pdep-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
