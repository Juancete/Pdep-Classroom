import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Respuesta = { ok: true; json: () => Promise<{ unread: number }> };

function respuesta(unread: number): Respuesta {
  return { ok: true, json: async () => ({ unread }) };
}

function definirVisibilidad(valor: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: valor });
}

async function avanzar(milisegundos: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milisegundos);
  });
}

// El store es un singleton de módulo: se reimporta en cada test para que no
// arrastre valor ni suscriptores del anterior.
async function cargarModulos() {
  vi.resetModules();
  const { useErrorLogCount } = await import("./use-error-log-count");
  const { contadorDeErroresSinLeer } = await import("./contador-de-errores-sin-leer");
  return { useErrorLogCount, contadorDeErroresSinLeer };
}

describe("useErrorLogCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    definirVisibilidad("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("consulta al montar y cada 60 segundos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(4));
    vi.stubGlobal("fetch", fetchMock);
    const { useErrorLogCount } = await cargarModulos();

    const { result } = renderHook(() => useErrorLogCount(true));
    await avanzar(0);
    expect(result.current).toBe(4);

    await avanzar(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("no consulta para alumnos", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useErrorLogCount } = await cargarModulos();

    const { result } = renderHook(() => useErrorLogCount(false));
    await avanzar(120_000);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toBe(0);
  });

  it("pausa mientras la pestaña está oculta y refresca al volver a verse", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(1));
    vi.stubGlobal("fetch", fetchMock);
    const { useErrorLogCount } = await cargarModulos();
    renderHook(() => useErrorLogCount(true));
    await avanzar(0);

    definirVisibilidad("hidden");
    await avanzar(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    definirVisibilidad("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("conserva el último conteo ante una falla de red", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta(5))
      .mockRejectedValueOnce(new Error("red caída"));
    vi.stubGlobal("fetch", fetchMock);
    const { useErrorLogCount, contadorDeErroresSinLeer } = await cargarModulos();
    const { result } = renderHook(() => useErrorLogCount(true));
    await avanzar(0);

    await act(async () => {
      await contadorDeErroresSinLeer.refrescar();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(5);
  });

  it("ignora una respuesta anterior que termina después de la más reciente", async () => {
    let resolverPrimera!: (valor: Respuesta) => void;
    let resolverSegunda!: (valor: Respuesta) => void;
    const primera = new Promise<Respuesta>((resolve) => {
      resolverPrimera = resolve;
    });
    const segunda = new Promise<Respuesta>((resolve) => {
      resolverSegunda = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(primera).mockReturnValueOnce(segunda));
    const { useErrorLogCount, contadorDeErroresSinLeer } = await cargarModulos();
    const { result } = renderHook(() => useErrorLogCount(true));
    await avanzar(0);
    await act(async () => {
      void contadorDeErroresSinLeer.refrescar();
    });

    await act(async () => {
      resolverSegunda(respuesta(8));
      await segunda;
    });
    expect(result.current).toBe(8);

    await act(async () => {
      resolverPrimera(respuesta(2));
      await primera;
    });
    expect(result.current).toBe(8);
  });

  it("al desmontar el último suscriptor se frena el polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(3));
    vi.stubGlobal("fetch", fetchMock);
    const { useErrorLogCount } = await cargarModulos();
    const primero = renderHook(() => useErrorLogCount(true));
    const segundo = renderHook(() => useErrorLogCount(true));
    await avanzar(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    primero.unmount();
    await avanzar(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    segundo.unmount();
    await avanzar(180_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("al desmontar el último suscriptor aborta el pedido en curso", async () => {
    let senal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        senal = init.signal ?? undefined;
        return new Promise(() => {});
      })
    );
    const { useErrorLogCount } = await cargarModulos();
    const { unmount } = renderHook(() => useErrorLogCount(true));
    await avanzar(0);
    expect(senal?.aborted).toBe(false);

    unmount();

    expect(senal?.aborted).toBe(true);
  });

  it("refrescar() pega una vez y actualiza a los suscriptores", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(7));
    vi.stubGlobal("fetch", fetchMock);
    const { useErrorLogCount, contadorDeErroresSinLeer } = await cargarModulos();
    const { result } = renderHook(() => useErrorLogCount(true));
    await avanzar(0);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(respuesta(2));

    await act(async () => {
      await contadorDeErroresSinLeer.refrescar();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(2);
  });

  it("ignora un cuerpo sin `unread` numérico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unread: "mucho" }) })
    );
    const { useErrorLogCount } = await cargarModulos();
    const { result } = renderHook(() => useErrorLogCount(true));
    await avanzar(0);

    expect(result.current).toBe(0);
  });
});
