"use client";

import { useApiCall } from "@/hooks/useApiCall";
import { pedirJson } from "@/lib/pedir-json";

export function AcceptButton({
  assignmentId,
  etiqueta = "Aceptar",
  etiquetaCargando = "Creando repo…",
}: {
  assignmentId: string;
  etiqueta?: string;
  etiquetaCargando?: string;
}) {
  const { loading, error, call } = useApiCall();

  async function handleAccept() {
    await call(async () => {
      await pedirJson(`/api/assignments/${assignmentId}/accept`, { method: "POST" });
      window.location.reload();
    });
  }

  return (
    <div>
      <button
        onClick={handleAccept}
        disabled={loading}
        className="inline-flex items-center justify-center gap-1.5 text-sm bg-pdep-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-pdep-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {etiquetaCargando}
          </>
        ) : (
          etiqueta
        )}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
