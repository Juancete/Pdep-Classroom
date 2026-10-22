// Cliente fetch para los endpoints JSON de la app. Centraliza lo que antes
// se repetía en cada componente: armar headers/body, tolerar respuestas de
// error que no son JSON (un 502 con HTML) y traducir `!ok` en un error con
// mensaje legible. En respuestas exitosas, un 204 devuelve `null` sin parsear
// y un cuerpo que no es JSON lanza `ErrorDeApi` (el literal `null` es válido).
// Función pura, sin "use client": sólo usa `fetch`.

export class ErrorDeApi extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly cuerpo: unknown
  ) {
    super(message);
    this.name = "ErrorDeApi";
  }
}

export type OpcionesDePedido = Omit<RequestInit, "body"> & { json?: unknown };

function mensajeDelCuerpo(cuerpo: unknown): string | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const { error } = cuerpo as { error?: unknown };
  return typeof error === "string" ? error : null;
}

export async function pedirJson<Respuesta = unknown>(
  url: string,
  opciones: OpcionesDePedido = {}
): Promise<Respuesta> {
  const { json, headers, ...resto } = opciones;
  const init: RequestInit = { ...resto, headers };
  if (json !== undefined) {
    init.headers = { "Content-Type": "application/json", ...headers };
    init.body = JSON.stringify(json);
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    const cuerpo: unknown = await response.json().catch(() => null);
    throw new ErrorDeApi(
      mensajeDelCuerpo(cuerpo) ?? `Error ${response.status}`,
      response.status,
      cuerpo
    );
  }
  if (response.status === 204) return null as Respuesta;
  try {
    return (await response.json()) as Respuesta;
  } catch {
    throw new ErrorDeApi("Respuesta inválida del servidor", response.status, null);
  }
}
