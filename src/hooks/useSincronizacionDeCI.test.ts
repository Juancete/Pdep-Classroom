import { act, renderHook } from "@testing-library/react";
import { useSincronizacionDeCI } from "./useSincronizacionDeCI";
import type { RespuestaDeSincronizacion } from "@/lib/ci-sync-mensajes";

function mockResponse(ok: boolean, data: object = {}, status = ok ? 200 : 500) {
  return { ok, status, json: async () => data };
}

const RESPUESTA: RespuestaDeSincronizacion = {
  actualizadas: 1,
  omitidas: 0,
  fallidas: [],
  participacion: { actualizadas: 0, omitidas: 0, fallidas: [] },
};

describe("useSincronizacionDeCI", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pide la sincronización forzada y devuelve el resultado sin mensaje si no hay advertencia", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(true, RESPUESTA) as Response);
    const { result } = renderHook(() =>
      useSincronizacionDeCI("a1", { mensajeDeFallos: () => null })
    );

    let resultado: RespuestaDeSincronizacion | undefined;
    await act(async () => {
      resultado = await result.current.sincronizar();
    });

    expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/ci", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forzar: true }),
    });
    expect(resultado).toEqual(RESPUESTA);
    expect(result.current.mensaje).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("expone como mensaje la advertencia que arma `mensajeDeFallos`", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(true, RESPUESTA) as Response);
    const mensajeDeFallos = vi.fn().mockReturnValue("No se pudo actualizar el CI de tp-x");
    const { result } = renderHook(() => useSincronizacionDeCI("a1", { mensajeDeFallos }));

    await act(async () => {
      await result.current.sincronizar();
    });

    expect(mensajeDeFallos).toHaveBeenCalledWith(RESPUESTA);
    expect(result.current.mensaje).toBe("No se pudo actualizar el CI de tp-x");
  });

  it("ante un error del servidor devuelve undefined y expone el error como mensaje", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "Sin permisos" }, 403) as Response
    );
    const mensajeDeFallos = vi.fn();
    const { result } = renderHook(() => useSincronizacionDeCI("a1", { mensajeDeFallos }));

    let resultado: RespuestaDeSincronizacion | undefined;
    await act(async () => {
      resultado = await result.current.sincronizar();
    });

    expect(resultado).toBeUndefined();
    expect(mensajeDeFallos).not.toHaveBeenCalled();
    expect(result.current.mensaje).toBe("Sin permisos");
  });

  it("limpia la advertencia anterior al volver a sincronizar", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(true, RESPUESTA) as Response);
    const mensajeDeFallos = vi
      .fn()
      .mockReturnValueOnce("advertencia")
      .mockReturnValueOnce(null);
    const { result } = renderHook(() => useSincronizacionDeCI("a1", { mensajeDeFallos }));

    await act(async () => {
      await result.current.sincronizar();
    });
    expect(result.current.mensaje).toBe("advertencia");

    await act(async () => {
      await result.current.sincronizar();
    });
    expect(result.current.mensaje).toBeNull();
  });
});
