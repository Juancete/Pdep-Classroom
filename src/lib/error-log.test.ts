import { describe, expect, it } from "vitest";
import {
  contextoSanitizado,
  fingerprintDeError,
  mensajeSanitizado,
  prepararErrorLog,
} from "./error-log";

describe("error-log", () => {
  it("extrae y sanitiza el mensaje sin persistir el stack", () => {
    const error = new Error("Falló para juan@example.com con Bearer abc123456789012345678901234567890");
    const result = prepararErrorLog("POST /api/test", error);
    expect(result.message).toContain("[EMAIL_REDACTED]");
    expect(result.message).toContain("Bearer [REDACTED]");
    expect(result).not.toHaveProperty("stack");
  });

  it("usa un mensaje genérico para valores desconocidos", () => {
    expect(mensajeSanitizado({ problema: true })).toBe("Error inesperado");
  });

  it("redacta claves sensibles y conserva identificadores útiles", () => {
    expect(contextoSanitizado({
      assignmentId: "a1",
      email: "juan@example.com",
      authorization: "secreto",
      nested: { token: "abc", grupoId: "g1" },
    })).toEqual({
      assignmentId: "a1",
      email: "[EMAIL_REDACTED]",
      authorization: "[REDACTED]",
      nested: { token: "[REDACTED]", grupoId: "g1" },
    });
  });

  it("tolera ciclos y valores no serializables", () => {
    const circular: Record<string, unknown> = { ok: true, fn: () => undefined };
    circular.self = circular;
    expect(contextoSanitizado(circular)).toEqual({ ok: true, self: "[CIRCULAR]" });
  });

  it("no confunde un objeto compartido entre ramas con un ciclo", () => {
    const shared = { assignmentId: "a1" };
    expect(contextoSanitizado({ first: shared, second: shared })).toEqual({
      first: { assignmentId: "a1" },
      second: { assignmentId: "a1" },
    });
  });

  it("redacta secretos largos aunque sean puramente alfabéticos", () => {
    expect(mensajeSanitizado(new Error(`Falló con ${"a".repeat(32)}`))).toBe(
      "Falló con [REDACTED]"
    );
  });

  it("redacta credenciales en parámetros de query", () => {
    expect(
      mensajeSanitizado(
        new Error("Falló /callback?authorization=credencial&cookie=sesion&code=abc")
      )
    ).toBe(
      "Falló /callback?authorization=[REDACTED]&cookie=[REDACTED]&code=[REDACTED]"
    );
  });

  it("limita globalmente la expansión del contexto", () => {
    const context = Object.fromEntries(
      Array.from({ length: 20 }, (_, outer) => [
        `rama${outer}`,
        Array.from({ length: 20 }, (_, inner) => `valor-${outer}-${inner}`),
      ])
    );

    expect(JSON.stringify(contextoSanitizado(context))).toContain("[TRUNCATED]");
  });

  it("normaliza mayúsculas, espacios y UUIDs para deduplicar", () => {
    const first = fingerprintDeError(
      "POST /api/test",
      "Falló   550e8400-e29b-41d4-a716-446655440000"
    );
    const second = fingerprintDeError(
      "POST /api/test",
      "falló 550e8400-e29b-41d4-a716-446655440001"
    );
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("distingue rutas diferentes", () => {
    expect(fingerprintDeError("GET /a", "falló")).not.toBe(
      fingerprintDeError("GET /b", "falló")
    );
  });
});
