/**
 * Aplica `operation` a cada elemento de `items` con a lo sumo `limit`
 * ejecuciones concurrentes. Preserva el orden de `items` en el resultado.
 * Extraído de `borrarRepositoriosDeAssignment.ts` (issue #50) para
 * reutilizarlo también en `sincronizarAutograding.ts` (issue #58) — mismo
 * patrón de pool de workers manual, sin dependencia externa.
 */
export async function mapConConcurrenciaLimitada<T, R>(
  items: T[],
  limit: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await operation(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}
