"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";
import type { DeleteAssignmentReposResult } from "@/lib/services/borrarRepositoriosDeAssignment";

export function DeleteReposButton({
  assignmentId,
  activeRepoCount,
}: {
  assignmentId: string;
  activeRepoCount: number;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [result, setResult] = useState<DeleteAssignmentReposResult | null>(null);

  async function handleDelete() {
    if (
      !confirm(
        `¿Estás seguro? Esto eliminará ${activeRepoCount} ${activeRepoCount === 1 ? "repo" : "repos"} de GitHub. Esta acción no se puede deshacer.`
      )
    )
      return;

    setResult(null);
    const responseResult = await call(async () => {
      const response = await fetch(`/api/assignments/${assignmentId}/repos`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${response.status}`);
      }
      return (await response.json()) as DeleteAssignmentReposResult;
    });
    if (responseResult) {
      setResult(responseResult);
      router.refresh();
    }
  }

  if (activeRepoCount === 0 && !result) return null;

  const failedResults = result?.results.filter(
    (item) => item.status === "failed"
  );
  const confirmed = result
    ? result.deleted + result.alreadyAbsent
    : 0;

  return (
    <span className="inline-flex max-w-md flex-col items-start gap-2">
      {activeRepoCount > 0 && (
        <button
          onClick={handleDelete}
          disabled={loading}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {loading
            ? "Eliminando repos…"
            : result?.failed
              ? `Reintentar fallidos (${activeRepoCount})`
              : `Borrar todos los repos (${activeRepoCount})`}
        </button>
      )}
      {error && <span className="text-red-600 text-sm">{error}</span>}
      {result && (
        <span
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            result.ok
              ? "bg-green-50 text-green-800"
              : "bg-amber-50 text-amber-900"
          }`}
        >
          {result.ok ? (
            <>Se confirmaron {confirmed} de {result.attempted} repositorios.</>
          ) : (
            <>
              Se confirmaron {confirmed} de {result.attempted} repositorios.
              Fallaron {result.failed}; podés reintentarlos.
              <ul className="mt-1 list-disc pl-5">
                {failedResults?.map((item) => (
                  <li key={item.entregaId}>
                    <span className="font-mono">{item.repoName}</span>
                    {item.error ? `: ${item.error}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </span>
      )}
    </span>
  );
}
