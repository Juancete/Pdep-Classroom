import { describe, it, expect } from "vitest";
import { mensajeOperativo } from "./mensaje-operativo";

describe("mensajeOperativo", () => {
  it("devuelve el mensaje tal cual cuando no tiene nada sensible", () => {
    expect(mensajeOperativo(new Error("Repo no encontrado"))).toBe("Repo no encontrado");
  });

  it("redacta un GitHub PAT clásico", () => {
    expect(mensajeOperativo(new Error("token=github_pat_abc123XYZ"))).toBe(
      "token=[REDACTED]"
    );
  });

  it("redacta un token gh_ genérico", () => {
    expect(mensajeOperativo(new Error("usó ghp_secreto123"))).toBe("usó [REDACTED]");
  });

  it("redacta un Bearer", () => {
    expect(mensajeOperativo(new Error("Rechazado: Bearer secreto123"))).toBe(
      "Rechazado: Bearer [REDACTED]"
    );
  });

  it("redacta pares clave=valor sensibles", () => {
    expect(mensajeOperativo(new Error("authorization: secreto123"))).toBe(
      "authorization: [REDACTED]"
    );
  });

  it("trunca mensajes muy largos", () => {
    const mensaje = "a".repeat(2000);
    expect(mensajeOperativo(new Error(mensaje)).length).toBe(1000);
  });

  it("devuelve un mensaje genérico si el valor no es un Error", () => {
    expect(mensajeOperativo("no soy un error")).toBe("Error desconocido");
  });
});
