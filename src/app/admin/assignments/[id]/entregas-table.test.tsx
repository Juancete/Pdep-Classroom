import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { filterEntregas, EntregasTable } from "./entregas-table";
import type { EntregaRow } from "./entregas-table";

// CISyncButton/CIRerunButton/BorrarEntregaButton usan useRouter — no hay
// Router context en un render estático fuera de Next, hay que mockearlo
// igual que en delete-repos-button.test.tsx.
const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

function mockFetch(ok: boolean, data: object = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => data })
  );
}

// ── Helpers ──────────────────────────────────────────────────

function makeRow(overrides?: Partial<EntregaRow>): EntregaRow {
  return {
    id: "e1",
    githubUsernames: ["usuario1"],
    repoName: "kata-funcional-usuario1",
    repoUrl: "https://github.com/org/kata-funcional-usuario1",
    repoDeleted: false,
    estadoRepo: "activo",
    createdAt: "2/1/2026",
    nombreCompleto: "García, Juan",
    ci: {
      resultadoNombre: "sin_consultar",
      detalleUrl: undefined,
      permiteReejecucion: false,
    },
    ...overrides,
  };
}

const ASSIGNMENT_ID = "assignment-1";

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
    const html = renderToStaticMarkup(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[]} />);
    expect(html).toContain("No hay entregas todavía");
  });

  it("no muestra filas cuando no hay entregas", () => {
    const html = renderToStaticMarkup(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[]} />);
    expect(html).not.toContain("data-cols");
  });

  it("muestra filas cuando hay entregas", () => {
    const html = renderToStaticMarkup(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow()]} />);
    expect(html).toContain("García, Juan");
  });

  it("muestra las cabeceras de la tabla", () => {
    const html = renderToStaticMarkup(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow()]} />);
    expect(html).toContain("Usuario(s)");
    expect(html).toContain("Nombre completo");
    expect(html).toContain("Repositorio");
    expect(html).toContain("CI");
    expect(html).toContain("Actividad");
  });

  it("muestra los githubUsernames", () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ githubUsernames: ["juancito", "mariela"] })]} />
    );
    expect(html).toContain("juancito");
    expect(html).toContain("mariela");
  });

  it("muestra el nombre completo del alumno", () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ nombreCompleto: "Pérez, Ana" })]} />
    );
    expect(html).toContain("Pérez, Ana");
  });

  it("muestra el botón 'Ir al repo' cuando hay repoUrl", () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ repoUrl: "https://github.com/org/repo" })]}
      />
    );
    expect(html).toContain("Ir al repo");
    expect(html).toContain("https://github.com/org/repo");
  });

  it("el link al repo abre en ventana nueva", () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ repoUrl: "https://github.com/org/repo" })]} />
    );
    expect(html).toContain('target="_blank"');
  });

  it('muestra "Sin repo" cuando estadoRepo es "sin-repo"', () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ estadoRepo: "sin-repo", repoUrl: undefined })]} />
    );
    expect(html).toContain("Sin repo");
  });

  it('muestra "Repositorio borrado" cuando estadoRepo es "borrado"', () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ estadoRepo: "borrado" })]} />
    );
    expect(html).toContain("Repositorio borrado");
  });

  it("muestra la fecha de la entrega", () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ createdAt: "15/3/2026" })]} />
    );
    expect(html).toContain("15/3/2026");
  });

  it("muestra el último push cuando está disponible", () => {
    const html = renderToStaticMarkup(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID} mostrarGrupo={false}
        entregas={[makeRow({ ultimoPush: { fecha: "18/8/2026", por: "juancito" } })]}
      />
    );
    expect(html).toContain("Último push: 18/8/2026 (juancito)");
  });

  it("no muestra la línea de último push cuando no hay ninguno registrado", () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow({ ultimoPush: undefined })]} />
    );
    expect(html).not.toContain("Último push");
  });

  it("muestra el campo de búsqueda", () => {
    const html = renderToStaticMarkup(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow()]} />);
    expect(html).toContain('type="search"');
  });

  it("muestra todas las entregas en el render inicial (sin filtro activo)", () => {
    const html = renderToStaticMarkup(
      <EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[
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

// ── botón Borrar ──────────────────────────────────────────────

describe("columna Grupo", () => {
  it("muestra la columna y el nombre del grupo con mostrarGrupo", () => {
    const html = renderToStaticMarkup(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID}
        mostrarGrupo
        entregas={[makeRow({ grupoNombre: "Los Pibes" })]}
      />
    );
    expect(html).toContain("Grupo");
    expect(html).toContain("Los Pibes");
  });

  it("es la primera columna, antes de Nombre completo", () => {
    const html = renderToStaticMarkup(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID}
        mostrarGrupo
        entregas={[makeRow({ grupoNombre: "Los Pibes", nombreCompleto: "García, Juan" })]}
      />
    );
    expect(html.indexOf(">Grupo<")).toBeLessThan(html.indexOf(">Nombre completo<"));
    expect(html.indexOf("Los Pibes")).toBeLessThan(html.indexOf("García, Juan"));
  });

  it("no muestra la columna sin mostrarGrupo", () => {
    const html = renderToStaticMarkup(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID}
        mostrarGrupo={false}
        entregas={[makeRow({ grupoNombre: "Los Pibes" })]}
      />
    );
    expect(html).not.toContain("Los Pibes");
    expect(html).not.toContain(">Grupo<");
  });

  it("muestra un guion cuando la entrega no tiene grupo", () => {
    const html = renderToStaticMarkup(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID}
        mostrarGrupo
        entregas={[makeRow({ grupoNombre: undefined })]}
      />
    );
    expect(html).toMatch(/Grupo[\s\S]*—/);
  });

  it("filtra por nombre de grupo", () => {
    const rows = [
      makeRow({ id: "e1", grupoNombre: "Los Pibes" }),
      makeRow({ id: "e2", grupoNombre: "Las Pibas" }),
    ];
    expect(filterEntregas(rows, "las piba").map((row) => row.id)).toEqual(["e2"]);
  });
});

describe("botón Borrar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("muestra el botón Borrar en cada fila", () => {
    render(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow()]} />);
    expect(screen.getByRole("button", { name: /^borrar$/i })).toBeInTheDocument();
  });

  it("cancelar la confirmación no llama a fetch", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetch(true);
    render(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow()]} />);

    await user.click(screen.getByRole("button", { name: /^borrar$/i }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("aceptar la confirmación llama al DELETE de la entrega y refresca", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch(true);
    render(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID} mostrarGrupo={false}
        entregas={[makeRow({ id: "e1", repoName: "kata-funcional-usuario1" })]}
      />
    );

    await user.click(screen.getByRole("button", { name: /^borrar$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/assignments/${ASSIGNMENT_ID}/entregas/e1`,
        { method: "DELETE" }
      );
    });
    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
  });

  it("la confirmación nombra el repo cuando la entrega tiene uno", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID} mostrarGrupo={false}
        entregas={[makeRow({ repoName: "kata-funcional-usuario1" })]}
      />
    );

    await user.click(screen.getByRole("button", { name: /^borrar$/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("kata-funcional-usuario1")
    );
  });

  it("la confirmación usa 'esta entrega sin repo' cuando no hay repositorio", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <EntregasTable
        assignmentId={ASSIGNMENT_ID} mostrarGrupo={false}
        entregas={[makeRow({ repoName: undefined, estadoRepo: "sin-repo" })]}
      />
    );

    await user.click(screen.getByRole("button", { name: /^borrar$/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("esta entrega sin repo")
    );
  });

  it("muestra el error del hook si el borrado falla", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockFetch(false, { error: "No se pudo borrar el repositorio" });
    render(<EntregasTable assignmentId={ASSIGNMENT_ID} mostrarGrupo={false} entregas={[makeRow()]} />);

    await user.click(screen.getByRole("button", { name: /^borrar$/i }));

    expect(await screen.findByText("No se pudo borrar el repositorio")).toBeInTheDocument();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });
});
