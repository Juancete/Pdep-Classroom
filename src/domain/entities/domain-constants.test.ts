import { describe, it, expect } from "vitest";
import { normalizarGithubUsername, PARADIGMAS, TIPOS_ASSIGNMENT } from "./domain-constants";
import { PARADIGMAS as PARADIGMAS_DESDE_TYPES, TIPOS_ASSIGNMENT as TIPOS_ASSIGNMENT_DESDE_TYPES } from "@/types";

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

// Fase 4 de la auditoría de dominio: única fuente para paradigmas y tipos
// de assignment — `@/types` sólo reexporta, no vuelve a declarar el array.
describe("PARADIGMAS / TIPOS_ASSIGNMENT", () => {
  it("PARADIGMAS lista los tres paradigmas soportados", () => {
    expect(PARADIGMAS).toEqual(["funcional", "logico", "objetos"]);
  });

  it("TIPOS_ASSIGNMENT lista los dos tipos de assignment soportados", () => {
    expect(TIPOS_ASSIGNMENT).toEqual(["individual", "grupal"]);
  });

  it("@/types reexporta exactamente las mismas constantes (misma identidad)", () => {
    expect(PARADIGMAS_DESDE_TYPES).toBe(PARADIGMAS);
    expect(TIPOS_ASSIGNMENT_DESDE_TYPES).toBe(TIPOS_ASSIGNMENT);
  });
});
