import { afterEach, describe, expect, it, vi } from "vitest";
import { Octokit } from "@octokit/rest";

// Octokit REAL con `fetch` stubbeado: lo que se prueba es qué signal llega a
// cada solicitud, incluidas las páginas de `paginate` (issue #125).
import { clienteDeGithubConSignal, esColaborador, getEstadoCI } from "./github";

type LlamadaAFetch = { url: string; signal: AbortSignal | null | undefined };

const CREDENCIAL = { token: "token-de-instalacion" };
const URL_PAGINA_2 = "https://api.github.com/repositories/1/commits/main/check-runs?page=2";

function respuestaJson(cuerpo: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function checkRun(id: number) {
  return {
    id,
    status: "completed",
    conclusion: "success",
    head_sha: "abc123",
    started_at: "2026-09-21T10:00:00Z",
    completed_at: "2026-09-21T10:01:00Z",
    check_suite: { id: 900 + id },
  };
}

// Una solicitud "colgada" que, como el `fetch` real, se rechaza cuando su
// signal se aborta. Sin esto el test no distinguiría un signal respetado de uno
// ignorado.
function solicitudColgada(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function stubearFetch(
  responder: (llamada: LlamadaAFetch, numero: number) => Promise<Response>
): LlamadaAFetch[] {
  const llamadas: LlamadaAFetch[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: unknown, opciones?: { signal?: AbortSignal | null }) => {
      const llamada = { url: String(entrada), signal: opciones?.signal };
      llamadas.push(llamada);
      return responder(llamada, llamadas.length);
    })
  );
  return llamadas;
}

describe("cliente de GitHub con signal a nivel de instancia", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Fija la PREMISA del diseño. Si una versión futura de plugin-paginate-rest
  // empieza a reenviar `request.signal`, este test falla y avisa que ya no hace
  // falta el cliente por instancia para cubrir la paginación.
  it("premisa: paginate descarta un signal pasado por llamada, incluso en la primera página", async () => {
    const controlador = new AbortController();
    const llamadas = stubearFetch(async (_llamada, numero) =>
      numero === 1
        ? respuestaJson(
            { total_count: 2, check_runs: [checkRun(1)] },
            { link: `<${URL_PAGINA_2}>; rel="next"` }
          )
        : respuestaJson({ total_count: 2, check_runs: [checkRun(2)] })
    );
    const octokit = new Octokit({ auth: "token" });

    await octokit.paginate(octokit.checks.listForRef, {
      owner: "org",
      repo: "tp-ana",
      ref: "main",
      per_page: 100,
      request: { signal: controlador.signal },
    });

    expect(llamadas).toHaveLength(2);
    for (const llamada of llamadas) {
      expect(llamada.signal).not.toBe(controlador.signal);
    }
  });

  it("todas las solicitudes de getEstadoCI, incluidas las páginas de paginate, llevan el mismo signal", async () => {
    const controlador = new AbortController();
    const llamadas = stubearFetch(async (_llamada, numero) => {
      if (numero === 1) return respuestaJson({ default_branch: "main" });
      if (numero === 2) {
        return respuestaJson(
          { total_count: 2, check_runs: [checkRun(1)] },
          { link: `<${URL_PAGINA_2}>; rel="next"` }
        );
      }
      return respuestaJson({ total_count: 2, check_runs: [checkRun(2)] });
    });
    const cliente = clienteDeGithubConSignal(CREDENCIAL, controlador.signal);

    const estado = await getEstadoCI("tp-ana", cliente);

    expect(estado.tipo).toBe("checks");
    // repos.get + página 1 + página 2.
    expect(llamadas).toHaveLength(3);
    expect(llamadas[2]!.url).toBe(URL_PAGINA_2);
    // Un signal pasado POR LLAMADA a `paginate` no llegaba ni a la primera
    // página (el iterador sólo reenvía method/url/headers). A nivel de
    // instancia llega a las tres.
    for (const llamada of llamadas) {
      expect(llamada.signal).toBe(controlador.signal);
    }
  });

  it("abortar mientras se pide la segunda página cancela esa solicitud y no pide más", async () => {
    const controlador = new AbortController();
    const llamadas = stubearFetch(async (llamada, numero) => {
      if (numero === 1) return respuestaJson({ default_branch: "main" });
      if (numero === 2) {
        return respuestaJson(
          { total_count: 3, check_runs: [checkRun(1)] },
          { link: `<${URL_PAGINA_2}>; rel="next"` }
        );
      }
      // La página 2 nunca responde: sólo termina si el signal la corta.
      return solicitudColgada(llamada.signal);
    });
    const cliente = clienteDeGithubConSignal(CREDENCIAL, controlador.signal);

    const resultado = getEstadoCI("tp-ana", cliente);
    const rechazo = expect(resultado).rejects.toBeDefined();
    await vi.waitFor(() => expect(llamadas).toHaveLength(3));

    controlador.abort();
    await rechazo;

    // Ninguna solicitud posterior al aborto: el trabajo original no sigue
    // corriendo por detrás (a diferencia de un `Promise.race` contra un timer).
    expect(llamadas).toHaveLength(3);
  });

  it("las solicitudes comparten UN presupuesto: la segunda se corta con lo que quedaba, no con uno propio", async () => {
    const controlador = new AbortController();
    let segundoSignal: AbortSignal | null | undefined;
    stubearFetch(async (llamada, numero) => {
      if (numero === 1) return respuestaJson({ default_branch: "main" });
      segundoSignal = llamada.signal;
      return solicitudColgada(llamada.signal);
    });
    const cliente = clienteDeGithubConSignal(CREDENCIAL, controlador.signal);

    const resultado = getEstadoCI("tp-ana", cliente);
    const rechazo = expect(resultado).rejects.toBeDefined();
    await vi.waitFor(() => expect(segundoSignal).toBeDefined());
    // La primera ya terminó y consumió parte del presupuesto; la segunda usa el
    // MISMO signal, así que vence cuando vence el presupuesto compartido.
    expect(segundoSignal).toBe(controlador.signal);
    expect(segundoSignal!.aborted).toBe(false);

    controlador.abort();
    await rechazo;
  });

  it("esColaborador respeta el signal del cliente acotado", async () => {
    const controlador = new AbortController();
    const llamadas = stubearFetch(async () => new Response(null, { status: 204 }));
    const cliente = clienteDeGithubConSignal(CREDENCIAL, controlador.signal);

    await expect(esColaborador("tp-ana", "ana", cliente)).resolves.toBe(true);

    expect(llamadas[0]!.signal).toBe(controlador.signal);
  });

  it("esColaborador se rechaza (y no devuelve false) si el presupuesto ya venció", async () => {
    const controlador = new AbortController();
    stubearFetch(async (llamada) => solicitudColgada(llamada.signal));
    const cliente = clienteDeGithubConSignal(CREDENCIAL, controlador.signal);

    const resultado = esColaborador("tp-ana", "ana", cliente);
    const rechazo = expect(resultado).rejects.toBeDefined();
    controlador.abort();

    // Un abort no es un 404: no se confunde con "no es colaborador".
    await rechazo;
  });
});
