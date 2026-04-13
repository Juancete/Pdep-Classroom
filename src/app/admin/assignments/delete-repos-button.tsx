"use client";

import { useRouter } from "next/navigation";
import { useApiCall } from "@/app/hooks/useApiCall";

export function DeleteReposButton({
  assignmentId,
  activeRepoCount,
}: {
  assignmentId: string;
  activeRepoCount: number;
}) {
  const router = useRouter();
  const { loading, error, call } = useApiCall();

  async function handleDelete() {
    if (
      !confirm(
        `¿Estás seguro? Esto eliminará ${activeRepoCount} ${activeRepoCount === 1 ? "repo" : "repos"} de GitHub. Esta acción no se puede deshacer.`
      )
    )
      return;

    await call(async () => {
      const res = await fetch(`/api/assignments/${assignmentId}/repos`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${res.status}`);
      }
      router.refresh();
    });
  }

  if (activeRepoCount === 0) return null;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleDelete}
        disabled={loading}
        className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
      >
        {loading ? "Eliminando repos…" : `Borrar todos los repos (${activeRepoCount})`}
      </button>
      {error && <span className="text-red-600 text-sm">{error}</span>}
    </span>
  );
}
