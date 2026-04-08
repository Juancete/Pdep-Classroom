import { describe, it, expect } from "vitest";
import { buildRepoName, slugify, extractTemplateName } from "./naming";

// ── buildRepoName ───────────────────────────────────────────

describe("buildRepoName", () => {
  it("individual: slug-username", () => {
    expect(
      buildRepoName({ slug: "kata-funcional", usernames: ["juangarcia"] })
    ).toBe("kata-funcional-juangarcia");
  });

  it("grupal con grupoId: slug-grupoid", () => {
    expect(
      buildRepoName({
        slug: "tp-funcional",
        usernames: ["juangarcia", "mariaperez"],
        grupoId: "los-lambdas",
      })
    ).toBe("tp-funcional-los-lambdas");
  });

  it("grupal sin grupoId: slug-usuario1-usuario2-usuario3 (max 3)", () => {
    expect(
      buildRepoName({
        slug: "tp-logico",
        usernames: ["alice", "bob", "charlie", "diana"],
      })
    ).toBe("tp-logico-alice-bob-charlie");
  });

  it("normaliza a lowercase", () => {
    expect(
      buildRepoName({ slug: "Kata-Funcional", usernames: ["JuanGarcia"] })
    ).toBe("kata-funcional-juangarcia");
  });

  it("grupal con un solo miembro sin grupoId", () => {
    expect(
      buildRepoName({ slug: "tp-objetos", usernames: ["solo"] })
    ).toBe("tp-objetos-solo");
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
});

// ── extractTemplateName ─────────────────────────────────────

describe("extractTemplateName", () => {
  it("extrae nombre sin org", () => {
    expect(extractTemplateName("pdep-mn-utn/kata-template")).toBe("kata-template");
  });

  it("devuelve tal cual si no tiene org", () => {
    expect(extractTemplateName("kata-template")).toBe("kata-template");
  });

  it("maneja múltiples barras (toma el último segmento)", () => {
    expect(extractTemplateName("a/b/c/template")).toBe("template");
  });
});
