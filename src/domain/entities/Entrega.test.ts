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

describe("Entrega.matcheaQuery", () => {
  it("devuelve true para query vacía (no filtra nada)", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["ana"] });
    expect(entrega.matcheaQuery("")).toBe(true);
    expect(entrega.matcheaQuery("   ")).toBe(true);
  });

  it("devuelve true cuando la query coincide con un username", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["AnaGarcia", "bob"] });
    expect(entrega.matcheaQuery("ana")).toBe(true);
  });

  it("es case-insensitive en usernames", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["AnaGarcia"] });
    expect(entrega.matcheaQuery("anagarcia")).toBe(true);
    expect(entrega.matcheaQuery("ANAGARCIA")).toBe(true);
  });

  it("devuelve true cuando la query coincide con el repoName", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["ana"], repoName: "tp-funcional-ana" });
    expect(entrega.matcheaQuery("funcional")).toBe(true);
  });

  it("devuelve false cuando la query no coincide con ningún campo", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["ana"], repoName: "tp-funcional-ana" });
    expect(entrega.matcheaQuery("logico")).toBe(false);
  });

  it("tolera repoName undefined sin explotar", () => {
    const entrega = nuevaEntrega({ githubUsernames: ["ana"], repoName: undefined });
    expect(entrega.matcheaQuery("algo")).toBe(false);
  });
});
