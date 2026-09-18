import { describe, it, expect } from "vitest";
import { parsePage, single } from "./search-params";

// ── parsePage ───────────────────────────────────────────────

describe("parsePage", () => {
  it("undefined devuelve página 1", () => {
    expect(parsePage(undefined)).toBe(1);
  });

  it("valor no numérico devuelve página 1", () => {
    expect(parsePage("no")).toBe(1);
  });

  it("valor negativo devuelve página 1", () => {
    expect(parsePage("-2")).toBe(1);
  });

  it("cero devuelve página 1", () => {
    expect(parsePage("0")).toBe(1);
  });

  it("valor decimal devuelve página 1", () => {
    expect(parsePage("1.5")).toBe(1);
  });

  it("valor entero positivo se respeta", () => {
    expect(parsePage("4")).toBe(4);
  });

  it("array toma el primer valor", () => {
    expect(parsePage(["3", "5"])).toBe(3);
  });
});

// ── single ──────────────────────────────────────────────────

describe("single", () => {
  it("undefined devuelve undefined", () => {
    expect(single(undefined)).toBeUndefined();
  });

  it("string vacío devuelve undefined", () => {
    expect(single("")).toBeUndefined();
  });

  it("string sólo espacios devuelve undefined", () => {
    expect(single("   ")).toBeUndefined();
  });

  it("recorta espacios del valor", () => {
    expect(single("  perez  ")).toBe("perez");
  });

  it("array toma el primer valor", () => {
    expect(single(["perez", "garcia"])).toBe("perez");
  });

  it("array con primer valor vacío devuelve undefined", () => {
    expect(single(["", "garcia"])).toBeUndefined();
  });
});
