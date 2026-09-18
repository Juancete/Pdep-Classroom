import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EtiquetaDeComision } from "./EtiquetaDeComision";

describe("EtiquetaDeComision", () => {
  it("muestra el año y el badge Activa para una comisión activa", () => {
    const html = renderToStaticMarkup(
      <EtiquetaDeComision comision={{ anio: 2026, activa: true }} />
    );
    expect(html).toContain("2026");
    expect(html).toContain("Activa");
    expect(html).not.toContain("Histórica");
  });

  it("muestra el año y el badge Histórica para una comisión no activa", () => {
    const html = renderToStaticMarkup(
      <EtiquetaDeComision comision={{ anio: 2025, activa: false }} />
    );
    expect(html).toContain("2025");
    expect(html).toContain("Histórica");
  });

  it('muestra "Sin comisión" cuando no hay comisión', () => {
    const html = renderToStaticMarkup(<EtiquetaDeComision />);
    expect(html).toContain("Sin comisión");
  });
});
