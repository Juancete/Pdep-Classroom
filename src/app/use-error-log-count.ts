"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ERROR_LOGS_CHANGED_EVENT = "pdep:error-logs-changed";
const POLL_INTERVAL_MS = 60_000;

export function useErrorLogCount(enabled: boolean): number {
  const [unread, setUnread] = useState(0);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || document.visibilityState !== "visible") return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/admin/errores/count", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (
        typeof data === "object" &&
        data !== null &&
        typeof (data as { unread?: unknown }).unread === "number"
      ) {
        setUnread(Math.max(0, (data as { unread: number }).unread));
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        // El badge es informativo: conserva el último valor ante una falla de red.
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onErrorsChanged = () => void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(ERROR_LOGS_CHANGED_EVENT, onErrorsChanged);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initial);
      requestRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(ERROR_LOGS_CHANGED_EVENT, onErrorsChanged);
    };
  }, [enabled, refresh]);

  return enabled ? unread : 0;
}
