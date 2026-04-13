"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteButton({
  confirmMessage,
  endpoint,
}: {
  confirmMessage: string;
  endpoint: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(confirmMessage)) return;
    setLoading(true);
    try {
      await fetch(endpoint, { method: "DELETE" });
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
