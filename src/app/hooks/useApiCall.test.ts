import { renderHook, act } from "@testing-library/react";
import { useApiCall } from "./useApiCall";

describe("useApiCall", () => {
  it("inicia con loading=false y error=null", () => {
    const { result } = renderHook(() => useApiCall());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("retorna el valor de la función", async () => {
    const { result } = renderHook(() => useApiCall());
    let value: number | undefined;

    await act(async () => {
      value = await result.current.call(async () => 42);
    });

    expect(value).toBe(42);
  });

  it("pone loading=true mientras ejecuta y false al terminar", async () => {
    const { result } = renderHook(() => useApiCall());
    let resolveFn!: () => void;
    const deferred = new Promise<void>((r) => { resolveFn = r; });

    // inicia el call sin await
    act(() => { result.current.call(() => deferred); });
    expect(result.current.loading).toBe(true);

    // resuelve
    await act(async () => { resolveFn(); });
    expect(result.current.loading).toBe(false);
  });

  it("setea el mensaje de error cuando la función lanza un Error", async () => {
    const { result } = renderHook(() => useApiCall());

    await act(async () => {
      await result.current.call(async () => {
        throw new Error("algo falló");
      });
    });

    expect(result.current.error).toBe("algo falló");
    expect(result.current.loading).toBe(false);
  });

  it("setea 'Error desconocido' si el throw no es un Error", async () => {
    const { result } = renderHook(() => useApiCall());

    await act(async () => {
      await result.current.call(async () => { throw "string error"; });
    });

    expect(result.current.error).toBe("Error desconocido");
  });

  it("limpia el error previo en cada nuevo call", async () => {
    const { result } = renderHook(() => useApiCall());

    await act(async () => {
      await result.current.call(async () => { throw new Error("error previo"); });
    });
    expect(result.current.error).toBe("error previo");

    await act(async () => {
      await result.current.call(async () => {});
    });
    expect(result.current.error).toBeNull();
  });

  it("retorna undefined cuando la función lanza", async () => {
    const { result } = renderHook(() => useApiCall());
    let value: unknown = "sentinel";

    await act(async () => {
      value = await result.current.call(async () => { throw new Error("x"); });
    });

    expect(value).toBeUndefined();
  });
});
