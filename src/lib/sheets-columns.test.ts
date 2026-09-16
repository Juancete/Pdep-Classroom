import { describe, it, expect } from "vitest";
import { colLetter, rangoDeHoja } from "./sheets-columns";

describe("colLetter", () => {
  it("0 → A", () => expect(colLetter(0)).toBe("A"));
  it("1 → B", () => expect(colLetter(1)).toBe("B"));
  it("25 → Z", () => expect(colLetter(25)).toBe("Z"));
  it("26 → AA", () => expect(colLetter(26)).toBe("AA"));
  it("27 → AB", () => expect(colLetter(27)).toBe("AB"));
  it("51 → AZ", () => expect(colLetter(51)).toBe("AZ"));
  it("52 → BA", () => expect(colLetter(52)).toBe("BA"));
});

describe("rangoDeHoja", () => {
  it("entrecomilla una hoja con espacios", () => {
    expect(rangoDeHoja("Principal - posta", "A2:D500")).toBe(
      "'Principal - posta'!A2:D500"
    );
  });

  it("escapa apóstrofes duplicándolos", () => {
    expect(rangoDeHoja("O'Brien", "A1:B2")).toBe("'O''Brien'!A1:B2");
  });

  it("entrecomilla también una hoja con nombre simple", () => {
    expect(rangoDeHoja("Alumnos", "A2:F500")).toBe("'Alumnos'!A2:F500");
  });
});
