"use client";

import { useApiCall } from "@/app/hooks/useApiCall";

export function AcceptButton({ assignmentId }: { assignmentId: string }) {
  const { loading, error, call } = useApiCall();

  async function handleAccept() {
    await call(async () => {
      const res = await fetch(`/api/assignments/${assignmentId}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al crear el repo");
      }
      window.location.reload();
    });
  }

  return (
    <div>
      <button
        onClick={handleAccept}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm bg-pdep-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-pdep-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creando repo…
          </>
        ) : (
          "Aceptar"
        )}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
