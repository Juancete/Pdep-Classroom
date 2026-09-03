"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiCall } from "@/hooks/useApiCall";
import { FolderMinusIcon, SpinnerIcon } from "@/components/icons";
import type { DeleteAssignmentReposResult } from "@/application/borrarRepositoriosDeAssignment";

export function DeleteReposButton({
  assignmentId,
  assignmentSlug = assignmentId,
  activeRepoCount,
  deletionEnabled = true,
  compact = false,
}: {
  assignmentId: string;
  assignmentSlug?: string;
  activeRepoCount: number;
  deletionEnabled?: boolean;
  /** Ícono solo, sin el texto del botón — para filas angostas de tabla. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();
  const [result, setResult] = useState<DeleteAssignmentReposResult | null>(null);

  async function handleDelete() {
    if (!confirm(
      `Vas a revisar ${activeRepoCount} ${activeRepoCount === 1 ? "repo" : "repos"} de GitHub antes de eliminarlos.`
    )) return;
    setResult(null);
    const responseResult = await call(async () => {
      const previewResponse = await fetch(`/api/assignments/${assignmentId}/repos`);
      if (!previewResponse.ok) {
        const body = await previewResponse.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${previewResponse.status}`);
      }
      const preview = (await previewResponse.json()) as { repos?: string[]; slug?: string };
      const repos = Array.isArray(preview.repos)
        ? preview.repos
        : Array.from({ length: activeRepoCount }, (_, index) => `repositorio ${index + 1}`);
      const visibles = repos.slice(0, 20).map((repo) => `• ${repo}`).join("\n");
      const restantes = repos.length > 20
        ? `\n…y ${repos.length - 20} repositorios más.`
        : "";
      if (!confirm(`Se eliminarán estos repositorios de GitHub:\n\n${visibles}${restantes}\n\nEsta acción no se puede deshacer.`)) {
        return null;
      }
      const confirmation = prompt(`Escribí ${assignmentSlug} para confirmar:`);
      if (confirmation === null) return null;
      const response = await fetch(`/api/assignments/${assignmentId}/repos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
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

  if (!deletionEnabled || (activeRepoCount === 0 && !result)) return null;

  const failedResults = result?.results.filter(
    (item) => item.status === "failed"
  );
  const confirmed = result
    ? result.deleted + result.alreadyAbsent
    : 0;

  const triggerLabel = result?.failed
    ? `Reintentar fallidos (${activeRepoCount})`
    : `Borrar todos los repos (${activeRepoCount})`;

  const resultContent = result && (
    <>
      {result.ok ? (
        <>
          Se confirmaron {confirmed} de {result.attempted} repositorios.
        </>
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
    </>
  );

  if (compact) {
    // Sin `gap-*` acá: a diferencia de la versión completa (que vive sola en
    // su propia fila), este botón es un ícono más entre otros de la misma
    // altura en la grilla — un gap reservado incluso con el status vacío lo
    // desalinea verticalmente respecto a sus hermanos.
    return (
      <div className="inline-flex flex-col items-start">
        {activeRepoCount > 0 && (
          <button
            onClick={handleDelete}
            disabled={loading}
            title={triggerLabel}
            aria-label={triggerLabel}
            className="inline-flex items-center justify-center p-1.5 rounded-md text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <FolderMinusIcon className="w-4 h-4" />
            )}
          </button>
        )}
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
        <div
          role="status"
          aria-live="polite"
          className={
            result
              ? `mt-2 rounded-md px-3 py-2 text-sm ${
                  result.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"
                }`
              : undefined
          }
        >
          {resultContent}
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex max-w-md flex-col items-start gap-2">
      {activeRepoCount > 0 && (
        <button
          onClick={handleDelete}
          disabled={loading}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Eliminando repos…" : triggerLabel}
        </button>
      )}
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <div
        role="status"
        aria-live="polite"
        className={
          result
            ? `rounded-md px-3 py-2 text-sm ${
                result.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"
              }`
            : undefined
        }
      >
        {resultContent}
      </div>
    </div>
  );
}
