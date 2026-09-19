import { cache } from "react";
import type { Comision } from "@/domain/entities";
import { ContextoDeComision, resolverContextoDeComision } from "@/domain/entities";
import { leerComisionConsultadaId } from "@/infrastructure/navegacion/comisionConsultadaCookie";
import { getComisiones } from "@/infrastructure/repositories";

export interface ContextoDeComisionResuelto {
  contexto: ContextoDeComision;
  comisiones: Comision[];
}

// `cache()` de React memoiza esto dentro de una misma request (mismo patrón
// que `resolverUsuarioActual` en `src/infrastructure/auth/session.ts`):
// el layout del panel admin y la página que se está renderizando comparten
// una sola lectura de la cookie y una sola consulta a `getComisiones()` en
// vez de una por cada `obtenerContextoDeComision()` (issue #114).
const resolverContexto = cache(async (): Promise<ContextoDeComisionResuelto> => {
  const [idSeleccionado, comisiones] = await Promise.all([
    leerComisionConsultadaId(),
    getComisiones(),
  ]);

  return {
    contexto: resolverContextoDeComision(comisiones, idSeleccionado),
    comisiones,
  };
});

export async function obtenerContextoDeComision(): Promise<ContextoDeComisionResuelto> {
  return resolverContexto();
}
