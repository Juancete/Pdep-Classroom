import { describe, it, expect } from "vitest";
import { mapConConcurrenciaLimitada } from "./concurrencia";

describe("mapConConcurrenciaLimitada", () => {
  it("preserva el orden de los items en el resultado", async () => {
    const resultado = await mapConConcurrenciaLimitada(
      [1, 2, 3, 4],
      2,
      async (item) => item * 10
    );
    expect(resultado).toEqual([10, 20, 30, 40]);
  });

  it("no supera el límite de operaciones concurrentes", async () => {
    let activas = 0;
    let maxActivas = 0;

    await mapConConcurrenciaLimitada(
      Array.from({ length: 12 }, (_, index) => index),
      3,
      async () => {
        activas += 1;
        maxActivas = Math.max(maxActivas, activas);
        await new Promise((resolve) => setTimeout(resolve, 0));
        activas -= 1;
      }
    );

    expect(maxActivas).toBe(3);
  });

  it("con lista vacía devuelve un array vacío sin invocar la operación", async () => {
    let llamadas = 0;
    const resultado = await mapConConcurrenciaLimitada([], 5, async () => {
      llamadas += 1;
    });
    expect(resultado).toEqual([]);
    expect(llamadas).toBe(0);
  });

  it("con límite mayor a la cantidad de items igual procesa todos", async () => {
    const resultado = await mapConConcurrenciaLimitada([1, 2], 10, async (item) => item);
    expect(resultado).toEqual([1, 2]);
  });
});
