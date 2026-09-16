"use client";

const SANITIZED_MESSAGE = "An error occurred in the Server Components render";

// Markup y política de error compartidos por los dos boundaries del proyecto
// (`src/app/error.tsx` para segmentos, `src/app/global-error.tsx` para el
// root layout) — antes vivían duplicados con reglas ligeramente distintas.
// Política única: el mensaje del error sólo se muestra si Next no lo
// sanitizó (`SANITIZED_MESSAGE`, el prefijo genérico que usa en producción
// cuando un Server Component tira un error sin `digest` propio) Y estamos en
// desarrollo. En cualquier otro caso —incluida la sanitización de Next
// ocurriendo en dev— se muestra un mensaje genérico: no hay que filtrar
// mensajes arbitrarios (pueden traer detalles de infraestructura, como el
// host de la DB) fuera de desarrollo. El `digest`, en cambio, se muestra
// siempre que exista: es el dato que correlaciona con los logs del
// servidor, no un mensaje libre.
export function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const sanitizadoPorNext = !error.message || error.message.startsWith(SANITIZED_MESSAGE);
  const mostrarMensaje = !sanitizadoPorNext && process.env.NODE_ENV === "development";
  const displayMessage = mostrarMensaje
    ? error.message
    : "El servidor encontró un error. Revisá los logs para más detalles.";

  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">Algo salió mal</h1>
      <p className="text-gray-500 text-sm mb-4">
        Ocurrió un error inesperado. Podés intentar recargar la página.
      </p>
      <p className="text-red-500 font-mono text-xs bg-red-50 border border-red-100 rounded px-4 py-2 inline-block">
        {displayMessage}
      </p>
      {error.digest && (
        <p className="text-gray-400 font-mono text-xs mt-2">
          código: {error.digest}
        </p>
      )}
    </div>
  );
}
