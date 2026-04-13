"use client";

import { useState } from "react";

export function useApiCall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, call };
}
