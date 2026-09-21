import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const octokitHolder = vi.hoisted(() => ({
  auth: vi.fn(),
  opcionesDeInstancias: [] as Array<Record<string, unknown>>,
}));

// El Octokit real se ejercita en `github-acotado.test.ts`; acá se controla su
// `auth` para probar la obtención de la credencial y cómo se arma el cliente.
vi.mock("@octokit/rest", () => ({
  Octokit: class {
    constructor(opciones: Record<string, unknown>) {
      octokitHolder.opcionesDeInstancias.push(opciones);
    }
    auth = (...args: unknown[]) => octokitHolder.auth(...args);
  },
}));
vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn() }));

import {
  PRESUPUESTO_GITHUB_BAJO_LOCK_MS,
  TIMEOUT_CREDENCIAL_MS,
  clienteAcotadoDeGithub,
  clienteDeGithubConSignal,
  obtenerCredencialDeGithub,
} from "./github";

describe("obtenerCredencialDeGithub", () => {
  beforeEach(() => {
    octokitHolder.auth.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pide la autenticación de instalación y devuelve su token", async () => {
    octokitHolder.auth.mockResolvedValue({ type: "token", token: "ghs_abc" });

    await expect(obtenerCredencialDeGithub()).resolves.toEqual({ token: "ghs_abc" });

    expect(octokitHolder.auth).toHaveBeenCalledWith({ type: "installation" });
  });

  it("no deja temporizadores colgados cuando termina bien", async () => {
    vi.useFakeTimers();
    octokitHolder.auth.mockResolvedValue({ token: "ghs_abc" });

    await obtenerCredencialDeGithub();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("falla si la autenticación no trae un token", async () => {
    octokitHolder.auth.mockResolvedValue({ type: "unauthenticated" });

    await expect(obtenerCredencialDeGithub()).rejects.toThrow(
      "GitHub no devolvió un token de autenticación"
    );
  });

  it("falla con un mensaje operativo si vence el tope propio de la credencial", async () => {
    vi.useFakeTimers();
    // Nunca responde: sólo el tope propio puede terminar la espera.
    octokitHolder.auth.mockReturnValue(new Promise(() => undefined));

    const resultado = obtenerCredencialDeGithub(TIMEOUT_CREDENCIAL_MS);
    const rechazo = expect(resultado).rejects.toThrow(
      `GitHub no entregó la credencial en ${TIMEOUT_CREDENCIAL_MS} ms`
    );
    await vi.advanceTimersByTimeAsync(TIMEOUT_CREDENCIAL_MS);

    await rechazo;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("traduce los errores de autenticación a mensajes operativos", async () => {
    octokitHolder.auth.mockRejectedValue(new Error("secretOrPrivateKey Invalid keyData"));

    await expect(obtenerCredencialDeGithub()).rejects.toThrow("GITHUB_APP_PRIVATE_KEY inválida");
  });
});

describe("clientes acotados", () => {
  beforeEach(() => {
    octokitHolder.opcionesDeInstancias.length = 0;
  });

  it("clienteDeGithubConSignal fija el token y el signal a nivel de instancia", () => {
    const controlador = new AbortController();

    clienteDeGithubConSignal({ token: "ghs_abc" }, controlador.signal);

    expect(octokitHolder.opcionesDeInstancias.at(-1)).toEqual({
      auth: "ghs_abc",
      request: { signal: controlador.signal },
    });
  });

  it("clienteAcotadoDeGithub arma un signal que vence con el presupuesto", async () => {
    clienteAcotadoDeGithub({ token: "ghs_abc" }, 20);

    const { signal } = (octokitHolder.opcionesDeInstancias.at(-1) as {
      request: { signal: AbortSignal };
    }).request;
    expect(signal.aborted).toBe(false);

    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });
  });

  it("el presupuesto por defecto es el compartido de 8 s", () => {
    const evitarTemporizador = vi.spyOn(AbortSignal, "timeout");

    clienteAcotadoDeGithub({ token: "ghs_abc" });

    expect(evitarTemporizador).toHaveBeenCalledWith(PRESUPUESTO_GITHUB_BAJO_LOCK_MS);
    expect(PRESUPUESTO_GITHUB_BAJO_LOCK_MS).toBe(8_000);
    evitarTemporizador.mockRestore();
  });
});
