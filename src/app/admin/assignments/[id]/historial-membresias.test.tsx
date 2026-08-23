import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CambioDeMembresia } from "@/domain/entities";
import { HistorialDeMembresias } from "./historial-membresias";

function cambio(overrides: Partial<CambioDeMembresia> = {}) {
  const item = new CambioDeMembresia();
  item.id = "cambio-1";
  item.assignmentId = "a1";
  item.alumnoId = "alumno-1";
  item.alumnoUsername = "ana";
  item.accion = "baja";
  item.origen = "alumno";
  item.realizadoPor = "ana";
  item.grupoOrigenTeniaEntrega = false;
  item.grupoOrigenEliminado = false;
  item.creadoEn = new Date("2026-08-18T12:00:00Z");
  return Object.assign(item, overrides);
}

function historial(items: CambioDeMembresia[], overrides = {}) {
  return {
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    totalPages: 1,
    ...overrides,
  };
}

describe("HistorialDeMembresias", () => {
  it("muestra el estado vacío", () => {
    const html = renderToStaticMarkup(
      <HistorialDeMembresias assignmentId="a1" historial={historial([])} />
    );
    expect(html).toContain("Todavía no hay cambios de integrantes");
  });

  it("muestra alumno, acción, grupos y quién lo hizo", () => {
    const html = renderToStaticMarkup(
      <HistorialDeMembresias
        assignmentId="a1"
        historial={historial([
          cambio({
            accion: "cambio",
            grupoOrigenNombre: "Los Lambdas",
            grupoDestinoNombre: "Los Monoides",
            realizadoPor: "docente1",
            origen: "docente",
          }),
        ])}
      />
    );

    expect(html).toContain("@ana");
    expect(html).toContain("Cambio");
    expect(html).toContain("Los Lambdas");
    expect(html).toContain("Los Monoides");
    expect(html).toContain("docente1");
    expect(html).toContain("Docente");
  });

  it("indica cuando el grupo origen se eliminó", () => {
    const html = renderToStaticMarkup(
      <HistorialDeMembresias
        assignmentId="a1"
        historial={historial([
          cambio({ accion: "baja", grupoOrigenNombre: "Los Lambdas", grupoOrigenEliminado: true }),
        ])}
      />
    );
    expect(html).toContain("grupo eliminado");
  });

  it("muestra el motivo cuando está presente", () => {
    const html = renderToStaticMarkup(
      <HistorialDeMembresias
        assignmentId="a1"
        historial={historial([cambio({ motivo: "cambio de comisión" })])}
      />
    );
    expect(html).toContain("cambio de comisión");
  });

  it("incluye navegación paginada completa", () => {
    const html = renderToStaticMarkup(
      <HistorialDeMembresias
        assignmentId="a1"
        historial={historial([cambio()], { page: 2, total: 60, totalPages: 3 })}
      />
    );

    expect(html).toContain("Página 2 de 3");
    expect(html).toContain("membresiaPage=1");
    expect(html).toContain("membresiaPage=3");
  });

  it("conserva repoDeletionPage al paginar, para no perder el otro historial", () => {
    const html = renderToStaticMarkup(
      <HistorialDeMembresias
        assignmentId="a1"
        historial={historial([cambio()], { page: 2, total: 60, totalPages: 3 })}
        repoDeletionPage={4}
      />
    );

    expect(html).toContain("membresiaPage=1&amp;repoDeletionPage=4");
    expect(html).toContain("membresiaPage=3&amp;repoDeletionPage=4");
  });

  it("no agrega repoDeletionPage cuando es la página 1 (o no está seteada)", () => {
    const html = renderToStaticMarkup(
      <HistorialDeMembresias
        assignmentId="a1"
        historial={historial([cambio()], { page: 2, total: 60, totalPages: 3 })}
        repoDeletionPage={1}
      />
    );

    expect(html).not.toContain("repoDeletionPage");
  });
});
