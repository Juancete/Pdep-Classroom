const INTERVALO_DE_POLLING_MS = 60_000;

export type ContadorDeErroresSinLeer = {
  suscribir: (listener: () => void) => () => void;
  leer: () => number;
  refrescar: () => Promise<void>;
};

// Store externo (para `useSyncExternalStore`) con la cantidad de errores sin
// leer. El primer suscriptor arranca el polling y el último lo frena: el
// ciclo de vida de los disparadores lo da la suscripción, no un efecto.
export function crearContadorDeErroresSinLeer(): ContadorDeErroresSinLeer {
  let valor = 0;
  const listeners = new Set<() => void>();
  let temporizadorInicial: ReturnType<typeof setTimeout> | null = null;
  let intervalo: ReturnType<typeof setInterval> | null = null;
  let pedidoEnCurso: AbortController | null = null;

  function actualizar(nuevoValor: number) {
    if (nuevoValor === valor) return;
    valor = nuevoValor;
    listeners.forEach((listener) => listener());
  }

  async function refrescar(): Promise<void> {
    if (document.visibilityState !== "visible") return;
    pedidoEnCurso?.abort();
    const pedido = new AbortController();
    pedidoEnCurso = pedido;
    const esElMasReciente = () => pedidoEnCurso === pedido && !pedido.signal.aborted;
    try {
      const response = await fetch("/api/admin/errores/count", {
        cache: "no-store",
        signal: pedido.signal,
      });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (!esElMasReciente()) return;
      if (
        typeof data === "object" &&
        data !== null &&
        typeof (data as { unread?: unknown }).unread === "number"
      ) {
        actualizar(Math.max(0, (data as { unread: number }).unread));
      }
    } catch {
      // El badge es informativo: conserva el último valor ante una falla de
      // red (o un pedido abortado por uno más reciente).
    }
  }

  function alVolverseVisible() {
    if (document.visibilityState === "visible") void refrescar();
  }

  function arrancar() {
    temporizadorInicial = setTimeout(() => void refrescar(), 0);
    intervalo = setInterval(() => void refrescar(), INTERVALO_DE_POLLING_MS);
    document.addEventListener("visibilitychange", alVolverseVisible);
  }

  function frenar() {
    if (temporizadorInicial !== null) clearTimeout(temporizadorInicial);
    if (intervalo !== null) clearInterval(intervalo);
    temporizadorInicial = null;
    intervalo = null;
    document.removeEventListener("visibilitychange", alVolverseVisible);
    pedidoEnCurso?.abort();
    pedidoEnCurso = null;
  }

  function suscribir(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) arrancar();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) frenar();
    };
  }

  return { suscribir, leer: () => valor, refrescar };
}

export const contadorDeErroresSinLeer = crearContadorDeErroresSinLeer();
