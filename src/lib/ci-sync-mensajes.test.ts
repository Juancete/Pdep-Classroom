import { describe, expect, it } from "vitest";
import { mensajeDeFallosDeCI } from "./ci-sync-mensajes";
import type { SincronizarCIResult } from "@/application/sincronizarCI";

function resultado(fallidas: SincronizarCIResult["fallidas"]): SincronizarCIResult {
  return { actualizadas: 0, omitidas: 0, fallidas };
}

describe("mensajeDeFallosDeCI", () => {
  it("devuelve null cuando no hay fallidas", () => {
    expect(mensajeDeFallosDeCI(resultado([]))).toBeNull();
  });

  it("arma el mensaje con repo y error cuando hay una sola fallida", () => {
    const mensaje = mensajeDeFallosDeCI(
      resultado([{ repoName: "tp-ana", error: "La GitHub App no tiene permisos suficientes (403)" }])
    );
    expect(mensaje).toBe(
      "No se pudo actualizar el CI de tp-ana: La GitHub App no tiene permisos suficientes (403)"
    );
  });

  it("usa la primera fallida y agrega el conteo del resto cuando hay varias", () => {
    const mensaje = mensajeDeFallosDeCI(
      resultado([
        { repoName: "tp-ana", error: "403" },
        { repoName: "tp-bob", error: "403" },
        { repoName: "tp-clara", error: "timeout" },
      ])
    );
    expect(mensaje).toBe("No se pudo actualizar el CI de tp-ana: 403 (y 2 más)");
  });
});
