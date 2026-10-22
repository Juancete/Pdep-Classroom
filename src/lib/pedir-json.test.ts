import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorDeApi, pedirJson } from "./pedir-json";

function respuesta(ok: boolean, status: number, json: () => Promise<unknown>) {
  return { ok, status, json };
}

function mockearFetch(valor: ReturnType<typeof respuesta>) {
  const fetchMock = vi.fn().mockResolvedValue(valor);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function capturarError(): Promise<ErrorDeApi> {
  const fallo = await pedirJson("/api/algo").then(
    () => null,
    (error: unknown) => error
  );
  expect(fallo).toBeInstanceOf(ErrorDeApi);
  return fallo as ErrorDeApi;
}

describe("pedirJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve el cuerpo cuando la respuesta es ok", async () => {
    mockearFetch(respuesta(true, 200, async () => ({ estado: "abierto" })));

    await expect(pedirJson("/api/algo")).resolves.toEqual({ estado: "abierto" });
  });

  it("200 con cuerpo que no es JSON lanza ErrorDeApi con status 200", async () => {
    mockearFetch(
      respuesta(true, 200, async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      })
    );

    const fallo = await capturarError();

    expect(fallo.message).toBe("Respuesta inválida del servidor");
    expect(fallo.status).toBe(200);
    expect(fallo.cuerpo).toBeNull();
  });

  it("204 devuelve null sin intentar parsear el cuerpo", async () => {
    const json = vi.fn();
    mockearFetch(respuesta(true, 204, json));

    await expect(pedirJson("/api/algo")).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  it("200 con el literal JSON `null` devuelve null", async () => {
    mockearFetch(respuesta(true, 200, async () => null));

    await expect(pedirJson("/api/algo")).resolves.toBeNull();
  });

  it("lanza ErrorDeApi con el mensaje del servidor cuando trae `error`", async () => {
    mockearFetch(respuesta(false, 409, async () => ({ error: "Ya existe" })));

    const fallo = await capturarError();

    expect(fallo.message).toBe("Ya existe");
    expect(fallo.status).toBe(409);
  });

  it("si el cuerpo de error no es JSON (502 con HTML) da `Error 502` y no un error de parseo", async () => {
    mockearFetch(
      respuesta(false, 502, async () => {
        throw new SyntaxError("Unexpected token '<'");
      })
    );

    const fallo = await capturarError();

    expect(fallo.message).toBe("Error 502");
    expect(fallo.message).not.toContain("Unexpected token");
    expect(fallo.cuerpo).toBeNull();
  });

  it("usa `Error <status>` si el cuerpo no trae `error` string", async () => {
    mockearFetch(respuesta(false, 500, async () => ({ error: 42 })));

    await expect(pedirJson("/api/algo")).rejects.toThrow("Error 500");
  });

  it("con `json` arma headers y body", async () => {
    const fetchMock = mockearFetch(respuesta(true, 200, async () => ({})));

    await pedirJson("/api/algo", { method: "POST", json: { forzar: true } });

    expect(fetchMock).toHaveBeenCalledWith("/api/algo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forzar: true }),
    });
  });

  it("sin `json` no agrega body ni Content-Type", async () => {
    const fetchMock = mockearFetch(respuesta(true, 200, async () => ({})));

    await pedirJson("/api/algo", { method: "DELETE" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it("deja el cuerpo accesible en el error", async () => {
    mockearFetch(
      respuesta(false, 400, async () => ({ error: "Inválido", field: "legajo" }))
    );

    const fallo = await capturarError();

    expect(fallo.cuerpo).toEqual({ error: "Inválido", field: "legajo" });
  });
});
