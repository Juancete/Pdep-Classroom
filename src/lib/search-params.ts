// Helpers para leer los `searchParams` de una Server Component page de
// Next.js: el valor puede venir como `string`, `string[]` (query repetida)
// o `undefined`. Compartidos entre las páginas que paginan/filtran por
// query string (errores, alumnos, detalle de assignment).

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function single(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result?.trim() || undefined;
}
