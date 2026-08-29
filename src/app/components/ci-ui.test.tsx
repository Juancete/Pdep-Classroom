import { describe, it, expect } from "vitest";
import { NOMBRES_RESULTADO_CI, ResultadoCI } from "@/domain/entities";
import { CI_UI } from "./ci-ui";

// Fase 4 de la auditoría de dominio: `CI_UI` duplica a propósito el texto de
// `ResultadoCI` (evita que el bundle de cliente arrastre `@/domain/entities`
// — ver el comentario en `ci-ui.tsx`), pero esa duplicación ya había
// divergido en `error_infra` (le faltaba "(fallo de infraestructura)."). Este
// test ata las dos copias para que una futura divergencia rompa el build en
// vez de quedar silenciosa.
describe("CI_UI — coherencia con ResultadoCI", () => {
  it.each(NOMBRES_RESULTADO_CI)("la etiqueta de '%s' coincide con el dominio", (nombre) => {
    expect(CI_UI[nombre].etiqueta).toBe(ResultadoCI.desdeNombre(nombre).etiqueta());
  });

  it.each(NOMBRES_RESULTADO_CI)("el detalle de '%s' coincide con el dominio", (nombre) => {
    expect(CI_UI[nombre].detalle).toBe(ResultadoCI.desdeNombre(nombre).detalle());
  });
});
