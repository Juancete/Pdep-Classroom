import { describe, it, expect } from "vitest";
import {
  buildRepoName,
  enumerar,
  GITHUB_REPO_NAME_MAX_LENGTH,
  NombreRepositorioDemasiadoLargoError,
  slugify,
} from "./naming";

// ── buildRepoName ───────────────────────────────────────────

describe("buildRepoName", () => {
  it("individual: slug-username", () => {
    expect(
      buildRepoName({ slug: "kata-funcional", githubUsername: "juangarcia" })
    ).toBe("kata-funcional-juangarcia");
  });

  it("grupal con nombre normalizado: slug-nombregrupo", () => {
    expect(
      buildRepoName({
        slug: "tp-funcional",
        grupoNombreNormalizado: "los-lambdas",
      })
    ).toBe("tp-funcional-los-lambdas");
  });

  it("normaliza a lowercase", () => {
    expect(
      buildRepoName({
        slug: "Kata-Funcional",
        githubUsername: "JuanGarcia",
      })
    ).toBe("kata-funcional-juangarcia");
  });

  it("acepta el nombre completo cuando tiene exactamente el límite de GitHub", () => {
    const repoName = buildRepoName({
      slug: "a".repeat(90),
      githubUsername: "b".repeat(9),
    });

    expect(repoName).toHaveLength(GITHUB_REPO_NAME_MAX_LENGTH);
  });

  it("rechaza el nombre individual completo cuando supera el límite de GitHub", () => {
    expect(() =>
      buildRepoName({
        slug: "a".repeat(91),
        githubUsername: "b".repeat(9),
      })
    ).toThrow(NombreRepositorioDemasiadoLargoError);
  });

  it("rechaza el nombre grupal completo cuando supera el límite de GitHub", () => {
    expect(() =>
      buildRepoName({
        slug: "a".repeat(90),
        grupoNombreNormalizado: "b".repeat(10),
      })
    ).toThrow(
      "El nombre del repositorio generado supera el límite de 100 caracteres de GitHub."
    );
  });
});

// ── slugify ─────────────────────────────────────────────────

describe("slugify", () => {
  it("convierte título simple", () => {
    expect(slugify("Kata Funcional")).toBe("kata-funcional");
  });

  it("maneja caracteres especiales y acentos", () => {
    expect(slugify("Kata Funcional — Rompecabezas")).toBe(
      "kata-funcional-rompecabezas"
    );
  });

  it("quita acentos", () => {
    expect(slugify("Programación Lógica")).toBe("programacion-logica");
  });

  it("no deja guiones al inicio o final", () => {
    expect(slugify("--hola mundo--")).toBe("hola-mundo");
  });

  it("colapsa múltiples separadores", () => {
    expect(slugify("tp   funcional...1")).toBe("tp-funcional-1");
  });

  it("string vacío devuelve vacío", () => {
    expect(slugify("")).toBe("");
  });

  it("solo caracteres no permitidos devuelve vacío", () => {
    expect(slugify("  +++ /._  ")).toBe("");
  });
});

// ── enumerar ─────────────────────────────────────────────────

describe("enumerar", () => {
  it("devuelve vacío para una lista vacía", () => {
    expect(enumerar([])).toBe("");
  });

  it("devuelve el ítem tal cual cuando hay uno solo", () => {
    expect(enumerar(["a"])).toBe("a");
  });

  it("une dos ítems con 'ni'", () => {
    expect(enumerar(["a", "b"])).toBe("a ni b");
  });

  it("separa con coma y usa 'ni' antes del último", () => {
    expect(enumerar(["a", "b", "c"])).toBe("a, b ni c");
  });
});
