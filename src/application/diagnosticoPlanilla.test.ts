import { describe, expect, it } from "vitest";
import { evaluarPermisoDePlanilla } from "./diagnosticoPlanilla";

const CLIENT_EMAIL = "pdep-classroom@proyecto.iam.gserviceaccount.com";

describe("evaluarPermisoDePlanilla", () => {
  it("ok cuando la service account puede editar la planilla", () => {
    expect(evaluarPermisoDePlanilla({ puedeEditar: true, clientEmail: CLIENT_EMAIL })).toEqual({
      ok: true,
      detalle: `Escritura habilitada para ${CLIENT_EMAIL}`,
    });
  });

  it("revisar, con el email a compartir, cuando sólo puede leer (caso del #92)", () => {
    const resultado = evaluarPermisoDePlanilla({ puedeEditar: false, clientEmail: CLIENT_EMAIL });
    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toContain(CLIENT_EMAIL);
    expect(resultado.detalle).toContain("compartirla como Editor");
  });
});
