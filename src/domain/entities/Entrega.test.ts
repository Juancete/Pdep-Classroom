import { describe, it, expect } from "vitest";
import { Entrega } from "./Entrega";

function nuevaEntrega(overrides: Partial<Entrega> = {}): Entrega {
  const entrega = new Entrega();
  entrega.githubUsernames = ["ana-garcia"];
  entrega.repoDeleted = false;
  return Object.assign(entrega, overrides);
}

describe("Entrega.hasRepo", () => {
  it("devuelve true cuando hay repoUrl y no fue borrado", () => {
    const entrega = nuevaEntrega({ repoUrl: "https://github.com/org/repo", repoDeleted: false });
    expect(entrega.hasRepo()).toBe(true);
  });

  it("devuelve false cuando no hay repoUrl", () => {
    const entrega = nuevaEntrega({ repoUrl: undefined });
    expect(entrega.hasRepo()).toBe(false);
  });

  it("devuelve false cuando el repo fue borrado", () => {
    const entrega = nuevaEntrega({ repoUrl: "https://github.com/org/repo", repoDeleted: true });
    expect(entrega.hasRepo()).toBe(false);
  });
});

describe("aprovisionamiento de Entrega", () => {
  it("no considera activa una entrega cuyo repo fue borrado", () => {
    const entrega = nuevaEntrega({
      repoUrl: "https://github.com/org/repo",
      provisionEstado: "activa",
      repoDeleted: true,
    });

    expect(entrega.provisionEstaActiva()).toBe(false);
  });

  it("registra intentos, error y recuperación", () => {
    const entrega = nuevaEntrega({ provisionEstado: "fallida" });

    entrega.iniciarProvision();
    expect(entrega.provisionEstado).toBe("pendiente");
    expect(entrega.provisionIntentos).toBe(1);

    entrega.fallarProvision("GitHub no respondió");
    expect(entrega.provisionEstado).toBe("fallida");
    expect(entrega.provisionUltimoError).toBe("GitHub no respondió");

    entrega.completarProvision({
      repoName: "kata-ana",
      repoUrl: "https://github.com/org/kata-ana",
      repoGithubId: "123",
    });
    expect(entrega.provisionEstaActiva()).toBe(true);
    expect(entrega.provisionUltimoError).toBeUndefined();
    expect(entrega.repoGithubId).toBe("123");
  });
});

describe("Entrega.repoFueBorrado", () => {
  it("devuelve true cuando hay repoName y repoDeleted es true", () => {
    const entrega = nuevaEntrega({ repoName: "org-repo", repoDeleted: true });
    expect(entrega.repoFueBorrado()).toBe(true);
  });

  it("devuelve false cuando repoDeleted es false", () => {
    const entrega = nuevaEntrega({ repoName: "org-repo", repoDeleted: false });
    expect(entrega.repoFueBorrado()).toBe(false);
  });

  it("devuelve false cuando no hay repoName", () => {
    const entrega = nuevaEntrega({ repoName: undefined, repoDeleted: true });
    expect(entrega.repoFueBorrado()).toBe(false);
  });
});

describe("Entrega.estadoRepo", () => {
  it("devuelve 'activo' cuando tiene repo y no fue borrado", () => {
    const entrega = nuevaEntrega({
      repoName: "repo",
      repoUrl: "https://github.com/org/repo",
      repoDeleted: false,
    });
    expect(entrega.estadoRepo()).toBe("activo");
  });

  it("devuelve 'borrado' cuando el repo fue borrado", () => {
    const entrega = nuevaEntrega({ repoName: "repo", repoUrl: "https://github.com/org/repo", repoDeleted: true });
    expect(entrega.estadoRepo()).toBe("borrado");
  });

  it("devuelve 'sin-repo' cuando nunca tuvo repo", () => {
    const entrega = nuevaEntrega({ repoName: undefined, repoUrl: undefined });
    expect(entrega.estadoRepo()).toBe("sin-repo");
  });
});
