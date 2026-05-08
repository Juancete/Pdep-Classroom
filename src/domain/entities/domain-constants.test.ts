import { describe, it, expect } from "vitest";
import { normalizarGithubUsername } from "./domain-constants";

describe("normalizarGithubUsername", () => {
  it("elimina un @ inicial", () => {
    expect(normalizarGithubUsername("@juancete")).toBe("juancete");
  });

  it("elimina múltiples @ iniciales", () => {
    expect(normalizarGithubUsername("@@juancete")).toBe("juancete");
  });

  it("no toca @ en medio del nombre", () => {
    expect(normalizarGithubUsername("juan@cete")).toBe("juan@cete");
  });

  it("normaliza a minúsculas", () => {
    expect(normalizarGithubUsername("@JuanCete")).toBe("juancete");
  });

  it("elimina espacios en los extremos", () => {
    expect(normalizarGithubUsername("  @juancete  ")).toBe("juancete");
  });

  it("devuelve string vacío para null", () => {
    expect(normalizarGithubUsername(null)).toBe("");
  });

  it("devuelve string vacío para undefined", () => {
    expect(normalizarGithubUsername(undefined)).toBe("");
  });
});
