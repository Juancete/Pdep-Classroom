import { createHash } from "node:crypto";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_CONTEXT_STRING_LENGTH = 500;
const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_KEYS = 50;
const MAX_ARRAY_LENGTH = 20;

const SENSITIVE_KEY = /^(?:password|token|access_?token|authorization|cookie|secret|x-hub-signature-256)$/i;
const EMAIL_KEY = /^email$/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_QUERY = /([?&](?:token|access_token|code|secret|password)=)[^&#\s]*/gi;
const TOKEN_LIKE = /\b[A-Za-z0-9_-]{32,}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function limitar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : texto.slice(0, maximo);
}

export function sanitizarTextoError(valor: string, maximo = MAX_MESSAGE_LENGTH): string {
  return limitar(
    valor
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(EMAIL, "[EMAIL_REDACTED]")
      .replace(BEARER, "Bearer [REDACTED]")
      .replace(SENSITIVE_QUERY, "$1[REDACTED]")
      .replace(TOKEN_LIKE, "[REDACTED]")
      .replace(/\s+/g, " ")
      .trim(),
    maximo
  );
}

export function mensajeSanitizado(error: unknown): string {
  const original = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Error inesperado";
  return sanitizarTextoError(original) || "Error inesperado";
}

function sanitizarValor(
  valor: unknown,
  profundidad: number,
  visitados: WeakSet<object>
): unknown {
  if (valor === null || typeof valor === "boolean") return valor;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor === "string") return sanitizarTextoError(valor, MAX_CONTEXT_STRING_LENGTH);
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? undefined : valor.toISOString();
  if (typeof valor !== "object") return undefined;
  if (visitados.has(valor)) return "[CIRCULAR]";
  if (profundidad >= MAX_CONTEXT_DEPTH) return "[TRUNCATED]";
  visitados.add(valor);
  try {
    if (Array.isArray(valor)) {
      return valor
        .slice(0, MAX_ARRAY_LENGTH)
        .map((item) => sanitizarValor(item, profundidad + 1, visitados))
        .filter((item) => item !== undefined);
    }

    const resultado: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor).slice(0, MAX_CONTEXT_KEYS)) {
      if (EMAIL_KEY.test(clave)) {
        resultado[clave] = "[EMAIL_REDACTED]";
      } else if (SENSITIVE_KEY.test(clave)) {
        resultado[clave] = "[REDACTED]";
      } else {
        const sanitizado = sanitizarValor(contenido, profundidad + 1, visitados);
        if (sanitizado !== undefined) resultado[clave] = sanitizado;
      }
    }
    return resultado;
  } finally {
    // `visitados` representa únicamente el path de recursión actual. Un
    // objeto compartido por dos ramas es válido; sólo una referencia a un
    // ancestro del mismo path constituye un ciclo real.
    visitados.delete(valor);
  }
}

export function contextoSanitizado(
  context?: Record<string, unknown>
): Record<string, unknown> | null {
  if (!context) return null;
  const resultado = sanitizarValor(context, 0, new WeakSet<object>());
  if (!resultado || Array.isArray(resultado) || Object.keys(resultado).length === 0) return null;
  return resultado as Record<string, unknown>;
}

export function fingerprintDeError(route: string, message: string): string {
  const normalizado = message.toLowerCase().replace(UUID, "<uuid>").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${route}\n${normalizado}`, "utf8").digest("hex");
}

export function prepararErrorLog(
  route: string,
  error: unknown,
  context?: Record<string, unknown>
) {
  const message = mensajeSanitizado(error);
  return {
    route,
    message,
    context: contextoSanitizado(context),
    fingerprint: fingerprintDeError(route, message),
  };
}
