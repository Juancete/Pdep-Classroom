"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteComisionButton({ id, anio }: { id: string; anio: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`¿Eliminar la comisión ${anio}? Esta acción no se puede deshacer.`)) return;
    setLoading(true);
    try {
      await fetch(`/api/comisiones/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50"
    >
      {loading ? "Eliminando…" : "Eliminar"}
    </button>
  );
}
