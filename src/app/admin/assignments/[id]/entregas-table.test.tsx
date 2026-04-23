import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { filterEntregas, EntregasTable } from "./entregas-table";
import type { EntregaRow } from "./entregas-table";

// ── Helpers ──────────────────────────────────────────────────

function makeRow(overrides?: Partial<EntregaRow>): EntregaRow {
  return {
    id: "e1",
    githubUsernames: ["usuario1"],
    repoName: "kata-funcional-usuario1",
    repoUrl: "https://github.com/org/kata-funcional-usuario1",
    repoDeleted: false,
    createdAt: "2/1/2026",
    nombreCompleto: "García, Juan",
    ...overrides,
  };
}

// ── filterEntregas ────────────────────────────────────────────

describe("filterEntregas", () => {
  it("devuelve todas las entregas cuando la búsqueda está vacía", () => {
    const rows = [makeRow({ id: "e1" }), makeRow({ id: "e2" })];
    expect(filterEntregas(rows, "")).toHaveLength(2);
  });

  it("devuelve todas las entregas cuando la búsqueda es solo espacios", () => {
    const rows = [makeRow({ id: "e1" }), makeRow({ id: "e2" })];
    expect(filterEntregas(rows, "   ")).toHaveLength(2);
  });

  it("filtra por githubUsername (case insensitive)", () => {
    const rows = [
      makeRow({ id: "e1", githubUsernames: ["JuanCito"] }),
      makeRow({ id: "e2", githubUsernames: ["mariela"] }),
    ];
    const result = filterEntregas(rows, "juanci");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("filtra por repoName (case insensitive)", () => {
    const rows = [
      makeRow({ id: "e1", repoName: "kata-funcional-juan" }),
      makeRow({ id: "e2", repoName: "kata-funcional-ana" }),
    ];
    const result = filterEntregas(rows, "JUAN");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("retorna vacío cuando ninguna entrega coincide", () => {
    const rows = [makeRow({ id: "e1", githubUsernames: ["juan"] })];
    expect(filterEntregas(rows, "zzznoencontrado")).toHaveLength(0);
  });

  it("busca en todos los usernames de una entrega grupal", () => {
    const rows = [
      makeRow({ id: "e1", githubUsernames: ["juan", "ana"] }),
      makeRow({ id: "e2", githubUsernames: ["pedro"] }),
    ];
    const result = filterEntregas(rows, "ana");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("maneja repoName undefined sin romper", () => {
    const rows = [makeRow({ id: "e1", repoName: undefined })];
    expect(() => filterEntregas(rows, "algo")).not.toThrow();
  });
});

// ── EntregasTable (render inicial) ───────────────────────────

describe("EntregasTable", () => {
  it("muestra mensaje cuando no hay entregas", () => {
    const html = renderToStaticMarkup(<EntregasTable entregas={[]} />);
    expect(html).toContain("No hay entregas todavía");
  });

  it("no muestra filas cuando no hay entregas", () => {
    const html = renderToStaticMarkup(<EntregasTable entregas={[]} />);
    expect(html).not.toContain("data-cols");
  });

  it("muestra filas cuando hay entregas", () => {
    const html = renderToStaticMarkup(<EntregasTable entregas={[makeRow()]} />);
    expect(html).toContain("García, Juan");
  });

  it("muestra las cabeceras de la tabla", () => {
    const html = renderToStaticMarkup(<EntregasTable entregas={[makeRow()]} />);
    expect(html).toContain("Usuario(s)");
    expect(html).toContain("Nombre completo");
    expect(html).toContain("Repositorio");
    expect(html).toContain("Fecha");
  });

  it("muestra los githubUsernames", () => {
    const html = renderToStaticMarkup(
      <EntregasTable entregas={[makeRow({ githubUsernames: ["juancito", "mariela"] })]} />
    );
    expect(html).toContain("juancito");
    expect(html).toContain("mariela");
  });

  it("muestra el nombre completo del alumno", () => {
    const html = renderToStaticMarkup(
      <EntregasTable entregas={[makeRow({ nombreCompleto: "Pérez, Ana" })]} />
    );
    expect(html).toContain("Pérez, Ana");
  });

  it("muestra el botón 'Ir al repo' cuando hay repoUrl", () => {
    const html = renderToStaticMarkup(
      <EntregasTable
        entregas={[makeRow({ repoUrl: "https://github.com/org/repo" })]}
      />
    );
    expect(html).toContain("Ir al repo");
    expect(html).toContain("https://github.com/org/repo");
  });

  it("el link al repo abre en ventana nueva", () => {
    const html = renderToStaticMarkup(
      <EntregasTable entregas={[makeRow({ repoUrl: "https://github.com/org/repo" })]} />
    );
    expect(html).toContain('target="_blank"');
  });

  it('muestra "Sin repo" cuando no hay repoUrl', () => {
    const html = renderToStaticMarkup(
      <EntregasTable entregas={[makeRow({ repoUrl: undefined })]} />
    );
    expect(html).toContain("Sin repo");
  });

  it("muestra la fecha de la entrega", () => {
    const html = renderToStaticMarkup(
      <EntregasTable entregas={[makeRow({ createdAt: "15/3/2026" })]} />
    );
    expect(html).toContain("15/3/2026");
  });

  it("muestra el campo de búsqueda", () => {
    const html = renderToStaticMarkup(<EntregasTable entregas={[makeRow()]} />);
    expect(html).toContain('type="search"');
  });

  it("muestra todas las entregas en el render inicial (sin filtro activo)", () => {
    const html = renderToStaticMarkup(
      <EntregasTable
        entregas={[
          makeRow({ id: "e1", githubUsernames: ["alumno1"] }),
          makeRow({ id: "e2", githubUsernames: ["alumno2"] }),
          makeRow({ id: "e3", githubUsernames: ["alumno3"] }),
        ]}
      />
    );
    expect(html).toContain("alumno1");
    expect(html).toContain("alumno2");
    expect(html).toContain("alumno3");
  });
});
