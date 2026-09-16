"use client";

import "./globals.css";
import ErrorPage from "./error";

// Cubre errores del propio root layout: `layout.tsx` renderiza `<Nav />` y
// `<SyncPendingBanner />`, que llaman a `getCurrentUser()`, y esa consulta
// puede lanzar `PermisosNoVerificablesError` (fail hard, decisión
// deliberada del proyecto — no degradar el rol). Un error ahí nace por
// encima del root layout, así que el error boundary de segmento
// `error.tsx` no lo cubre; sin este archivo, Next muestra su pantalla
// genérica. Next exige que un `global-error.tsx` incluya `<html>/<body>`
// porque reemplaza al layout entero mientras está activo.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Next registra los errores de render del servidor antes de entregar este
  // boundary. No reenviamos detalles desde el cliente ni mostramos mensajes
  // arbitrarios fuera de desarrollo; el digest permite correlacionar los logs.
  const displayError = process.env.NODE_ENV === "development"
    ? error
    : Object.assign(new Error("El servidor encontró un error. Revisá los logs para más detalles."), {
        digest: error.digest,
      });
  return (
    <html lang="es">
      <body className="font-sans">
        <ErrorPage error={displayError} />
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={reset}
            className="bg-pdep-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
