"use client";

export default function GlobalError({ error }: { error: Error }) {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">
        Algo salió mal
      </h1>
      <p className="text-gray-500 text-sm mb-4">
        Ocurrió un error inesperado. Podés intentar recargar la página.
      </p>
      <p className="text-red-500 font-mono text-xs bg-red-50 border border-red-100 rounded px-4 py-2 inline-block">
        {error.message}
      </p>
    </div>
  );
}
