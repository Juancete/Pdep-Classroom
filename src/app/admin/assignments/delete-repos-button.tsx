"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteReposButton({
  assignmentId,
  activeRepoCount,
}: {
  assignmentId: string;
  activeRepoCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        `¿Estás seguro? Esto eliminará ${activeRepoCount} ${activeRepoCount === 1 ? "repo" : "repos"} de GitHub. Esta acción no se puede deshacer.`
      )
    )
      return;

    setLoading(true);
    try {
      await fetch(`/api/assignments/${assignmentId}/repos`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (activeRepoCount === 0) return null;

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
    >
      {loading ? "Eliminando repos…" : `Borrar todos los repos (${activeRepoCount})`}
    </button>
  );
}
