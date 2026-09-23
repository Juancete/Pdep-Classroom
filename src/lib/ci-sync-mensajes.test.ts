import { describe, expect, it } from "vitest";
import { mensajeDeFallosDeCI, mensajeDeFallosDeSincronizacion } from "./ci-sync-mensajes";
import type { SincronizarCIResult } from "@/application/sincronizarCI";
import type { RespuestaDeSincronizacion } from "./ci-sync-mensajes";

function resultado(fallidas: SincronizarCIResult["fallidas"]): SincronizarCIResult {
  return { actualizadas: 0, omitidas: 0, fallidas };
}

function respuesta(
  fallidasDeCI: SincronizarCIResult["fallidas"],
  fallidasDeParticipacion: SincronizarCIResult["fallidas"]
): RespuestaDeSincronizacion {
  return {
    ...resultado(fallidasDeCI),
    participacion: resultado(fallidasDeParticipacion),
  };
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

describe("mensajeDeFallosDeSincronizacion", () => {
  it("devuelve null cuando no hay fallidas ni de CI ni de participación", () => {
    expect(mensajeDeFallosDeSincronizacion(respuesta([], []))).toBeNull();
  });

  it("sólo CI con fallidas: devuelve sólo ese mensaje", () => {
    const mensaje = mensajeDeFallosDeSincronizacion(
      respuesta([{ repoName: "tp-ana", error: "403" }], [])
    );
    expect(mensaje).toBe("No se pudo actualizar el CI de tp-ana: 403");
  });

  it("sólo participación con fallidas: devuelve sólo ese mensaje", () => {
    const mensaje = mensajeDeFallosDeSincronizacion(
      respuesta([], [{ repoName: "tp-ana", error: "403" }])
    );
    expect(mensaje).toBe("No se pudo actualizar la participación de tp-ana: 403");
  });

  it("ambos con fallidas: une los dos mensajes con ' · '", () => {
    const mensaje = mensajeDeFallosDeSincronizacion(
      respuesta(
        [{ repoName: "tp-ana", error: "403" }],
        [{ repoName: "tp-bob", error: "timeout" }]
      )
    );
    expect(mensaje).toBe(
      "No se pudo actualizar el CI de tp-ana: 403 · No se pudo actualizar la participación de tp-bob: timeout"
    );
  });
});
