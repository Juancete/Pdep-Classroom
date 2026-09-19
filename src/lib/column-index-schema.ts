import { z } from "zod";

// Compartido por `src/lib/assignment-schema.ts` y
// `src/app/admin/comisiones/actions.ts` — vive en su propio módulo (y no en
// `sheets-columns.ts`, que también importan client components) para no
// meterles zod a esos bundles, y no en un archivo "use server" porque esos
// sólo pueden exportar funciones async.

// Tope en 701 (columna ZZ, 0-indexed): la Fase 1 del issue #82 agrega el
// legajo al final de una planilla de cursada en marcha, después de los
// bloques de notas de Funcional, Lógico y Objetos — eso cae bien pasada la Z.
export const ColumnIndexSchema = z.coerce
  .number({ invalid_type_error: "Debe ser un número de columna" })
  .int()
  .min(0, "Columna inválida")
  .max(701, "Columna inválida");

// "" → undefined para columnas opcionales: la UI envía string vacío cuando
// el admin elige "(sin columna)".
export const OptionalColumnIndexSchema = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : value),
  ColumnIndexSchema.optional()
);
