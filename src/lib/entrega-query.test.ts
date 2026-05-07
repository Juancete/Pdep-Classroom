import { describe, it, expect } from "vitest";
import { matcheaEntregaQuery } from "./entrega-query";

describe("matcheaEntregaQuery", () => {
  it("devuelve true con query vacío", () => {
    expect(matcheaEntregaQuery({ githubUsernames: [], repoName: null }, "")).toBe(true);
    expect(matcheaEntregaQuery({ githubUsernames: [], repoName: null }, "   ")).toBe(true);
  });

  it("matchea por username (case-insensitive)", () => {
    const row = { githubUsernames: ["JuanGarcia", "MariaLopez"], repoName: undefined };
    expect(matcheaEntregaQuery(row, "juan")).toBe(true);
    expect(matcheaEntregaQuery(row, "MARIA")).toBe(true);
    expect(matcheaEntregaQuery(row, "garcia")).toBe(true);
  });

  it("matchea por nombre de repo (case-insensitive)", () => {
    const row = { githubUsernames: [], repoName: "tp-funcional-2024" };
    expect(matcheaEntregaQuery(row, "funcional")).toBe(true);
    expect(matcheaEntregaQuery(row, "FUNCIONAL")).toBe(true);
  });

  it("no matchea cuando no hay coincidencia", () => {
    const row = { githubUsernames: ["ana"], repoName: "tp-logico" };
    expect(matcheaEntregaQuery(row, "juan")).toBe(false);
  });

  it("trata repoName null como string vacío", () => {
    const row = { githubUsernames: ["ana"], repoName: null };
    expect(matcheaEntregaQuery(row, "logico")).toBe(false);
  });

  it("trata repoName undefined como string vacío", () => {
    const row = { githubUsernames: ["ana"], repoName: undefined };
    expect(matcheaEntregaQuery(row, "logico")).toBe(false);
  });

  it("matchea parcialmente (substring)", () => {
    const row = { githubUsernames: ["juanperez"], repoName: "tp-objetos-2024" };
    expect(matcheaEntregaQuery(row, "perez")).toBe(true);
    expect(matcheaEntregaQuery(row, "objetos")).toBe(true);
  });
});
