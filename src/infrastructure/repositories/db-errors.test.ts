import { describe, it, expect } from "vitest";
import { extractDbErrorCode, UNIQUE_VIOLATION } from "./db-errors";

describe("extractDbErrorCode", () => {
  it("devuelve undefined si el error no es una instancia de Error", () => {
    expect(extractDbErrorCode("string-error")).toBeUndefined();
    expect(extractDbErrorCode(null)).toBeUndefined();
    expect(extractDbErrorCode(42)).toBeUndefined();
    expect(extractDbErrorCode(undefined)).toBeUndefined();
  });

  it("extrae el código directamente de error.code", () => {
    const error = Object.assign(new Error("unique violation"), { code: "23505" });
    expect(extractDbErrorCode(error)).toBe("23505");
  });

  it("extrae el código desde error.cause.code cuando error.code no existe", () => {
    const cause = Object.assign(new Error("inner"), { code: "23505" });
    const error = new Error("outer", { cause });
    expect(extractDbErrorCode(error)).toBe("23505");
  });

  it("prefiere error.code sobre cause.code si ambos existen", () => {
    const cause = Object.assign(new Error("inner"), { code: "12345" });
    const error = Object.assign(new Error("outer", { cause }), { code: "23505" });
    expect(extractDbErrorCode(error)).toBe("23505");
  });

  it("devuelve undefined si ni error.code ni cause.code están presentes", () => {
    const error = new Error("sin code");
    expect(extractDbErrorCode(error)).toBeUndefined();
  });

  it("devuelve undefined si cause no es un objeto", () => {
    const error = Object.assign(new Error("outer"), { cause: "string-cause" });
    expect(extractDbErrorCode(error)).toBeUndefined();
  });
});

describe("UNIQUE_VIOLATION", () => {
  it("es el código de violación de unicidad de Postgres", () => {
    expect(UNIQUE_VIOLATION).toBe("23505");
  });
});
