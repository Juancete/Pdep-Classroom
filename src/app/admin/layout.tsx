import type { ReactNode } from "react";
import { requireAdmin } from "@/infrastructure/auth/session";
import { obtenerContextoDeComision } from "@/application/comisionConsultada";
import { BarraDeComision } from "./barra-de-comision";

// Layout de todo `/admin/*` (issue #114). `requireAdmin()` va antes que
// `obtenerContextoDeComision()`: ésta llama a `getComisiones()`, que trae
// todos los años — sin el gate acá, un usuario sin alcance administrativo
// que llegara a renderizar este layout vería esa lista filtrarse igual.
// Las páginas siguen llamando a `requireAdmin()` y `obtenerContextoDeComision()`
// por su cuenta (ambas cacheadas por request con `cache()` de React —
// `resolverUsuarioActual` en `session.ts`, `resolverContexto` en
// `comisionConsultada.ts`), así que comparten el mismo resultado sin
// pagar una consulta extra.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const { contexto, comisiones } = await obtenerContextoDeComision();

  return (
    <div>
      <BarraDeComision contexto={contexto} comisiones={comisiones} />
      {children}
    </div>
  );
}
