import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_LOGS_CHANGED_EVENT, useErrorLogCount } from "./use-error-log-count";

describe("useErrorLogCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("consulta al montar y cada 60 segundos", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unread: 4 }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useErrorLogCount(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toBe(4);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("no consulta para alumnos", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useErrorLogCount(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pausa oculto y refresca al recuperar visibilidad o recibir el evento", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unread: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useErrorLogCount(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    await act(async () => { window.dispatchEvent(new Event(ERROR_LOGS_CHANGED_EVENT)); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("conserva el último conteo ante una falla", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unread: 5 }) })
      .mockRejectedValueOnce(new Error("red caída"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useErrorLogCount(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { window.dispatchEvent(new Event(ERROR_LOGS_CHANGED_EVENT)); await Promise.resolve(); });
    expect(result.current).toBe(5);
  });
});
