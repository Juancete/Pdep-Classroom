import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Alumno } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAlumnosPage = vi.fn();
const mockGetComisionActiva = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAlumnosPage: (...args: unknown[]) => mockGetAlumnosPage(...args),
  getComisionActiva: () => mockGetComisionActiva(),
}));

import AdminAlumnosPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAlumno(overrides?: Partial<Alumno>): Alumno {
  const alumno = new Alumno();
  alumno.legajo = "12345";
  alumno.nombre = "Juan";
  alumno.apellido = "Garcia";
  alumno.githubUsername = "juangarcia";
  alumno.email = "juan@example.com";
  Object.assign(alumno, overrides);
  alumno.id = overrides?.id ?? alumno.legajo;
  return alumno;
}

function paginaVacia(overrides?: Partial<Awaited<ReturnType<typeof mockGetAlumnosPage>>>) {
  return { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Alumnos page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetComisionActiva.mockResolvedValue({ id: "c1", spreadsheetId: "sheet-1" });
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAlumnosPage.mockResolvedValue(paginaVacia());
    await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("muestra el aviso cuando no hay comisión activa y no consulta alumnos", async () => {
    mockGetComisionActiva.mockResolvedValue(null);

    const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("No hay ninguna comisión activa configurada");
    expect(mockGetAlumnosPage).not.toHaveBeenCalled();
  });

  it("llama a getAlumnosPage con comisionId, page y busqueda", async () => {
    mockGetAlumnosPage.mockResolvedValue(paginaVacia());

    await AdminAlumnosPage({ searchParams: Promise.resolve({ page: "2", q: "perez" }) });

    expect(mockGetAlumnosPage).toHaveBeenCalledWith({
      comisionId: "c1",
      page: 2,
      busqueda: "perez",
    });
  });

  describe("estado vacío", () => {
    it("muestra mensaje cuando no hay alumnos y no hay búsqueda", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia());

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay alumnos ingresados");
    });

    it("muestra mensaje distinto cuando la búsqueda no encuentra resultados", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia());

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({ q: "inexistente" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No se encontraron alumnos para &quot;inexistente&quot;.");
    });

    it("muestra 0 alumnos en el subtítulo", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia());

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("0 alumnos");
    });
  });

  describe("con alumnos", () => {
    it("no muestra el estado vacío cuando hay alumnos", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia({ items: [makeAlumno()], total: 1 }));

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("No hay alumnos ingresados");
    });

    it("muestra la cantidad total de alumnos en el subtítulo", async () => {
      mockGetAlumnosPage.mockResolvedValue(
        paginaVacia({ items: [makeAlumno(), makeAlumno({ legajo: "67890" })], total: 2 })
      );

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("2 alumnos");
    });

    it("muestra la cantidad de resultados para la búsqueda actual", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia({ items: [makeAlumno()], total: 1 }));

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({ q: "garcia" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("1 resultados para &quot;garcia&quot;");
    });

    it("muestra el legajo del alumno", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia({ items: [makeAlumno({ legajo: "99999" })], total: 1 }));

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("99999");
    });

    it("muestra el nombre completo en formato Apellido, Nombre", async () => {
      mockGetAlumnosPage.mockResolvedValue(
        paginaVacia({ items: [makeAlumno({ nombre: "María", apellido: "Pérez" })], total: 1 })
      );

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Pérez");
      expect(html).toContain("María");
    });

    it("muestra el username de GitHub con link al perfil", async () => {
      mockGetAlumnosPage.mockResolvedValue(
        paginaVacia({ items: [makeAlumno({ githubUsername: "marialambda" })], total: 1 })
      );

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("marialambda");
      expect(html).toContain("https://github.com/marialambda");
    });

    it("muestra el email del alumno", async () => {
      mockGetAlumnosPage.mockResolvedValue(
        paginaVacia({ items: [makeAlumno({ email: "maria@example.com" })], total: 1 })
      );

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("maria@example.com");
    });

    it("muestra las cabeceras de la tabla", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia({ items: [makeAlumno()], total: 1 }));

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Legajo");
      expect(html).toContain("Nombre");
      expect(html).toContain("GitHub");
      expect(html).toContain("Email");
    });

    it("renderiza una fila por alumno", async () => {
      mockGetAlumnosPage.mockResolvedValue(
        paginaVacia({
          items: [
            makeAlumno({ id: "a1", legajo: "111" }),
            makeAlumno({ id: "a2", legajo: "222" }),
            makeAlumno({ id: "a3", legajo: "333" }),
          ],
          total: 3,
        })
      );

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("111");
      expect(html).toContain("222");
      expect(html).toContain("333");
    });
  });

  describe("formulario de búsqueda", () => {
    it("precarga el input con el término de búsqueda actual", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia());

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({ q: "perez" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain('type="search"');
      expect(html).toContain('name="q"');
      expect(html).toContain('value="perez"');
    });

    it("no muestra el link Limpiar sin búsqueda activa", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia());

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Limpiar");
    });

    it("muestra el link Limpiar hacia /admin/alumnos cuando hay búsqueda activa", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia());

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({ q: "perez" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Limpiar");
      expect(html).toContain('href="/admin/alumnos"');
    });
  });

  describe("paginación", () => {
    it("preserva la búsqueda en los links de paginación", async () => {
      mockGetAlumnosPage.mockResolvedValue(
        paginaVacia({ items: [makeAlumno()], total: 60, page: 2, totalPages: 3 })
      );

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({ page: "2", q: "perez" }) });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("/admin/alumnos?page=1&amp;q=perez");
      expect(html).toContain("/admin/alumnos?page=3&amp;q=perez");
    });

    it("no muestra la paginación cuando hay una sola página", async () => {
      mockGetAlumnosPage.mockResolvedValue(paginaVacia({ items: [makeAlumno()], total: 1, totalPages: 1 }));

      const element = await AdminAlumnosPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Paginación de alumnos");
    });
  });
});
