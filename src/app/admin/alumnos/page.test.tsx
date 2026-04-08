import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Alumno } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAlumnos = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/sheets", () => ({
  getAlumnos: () => mockGetAlumnos(),
}));

import AdminAlumnosPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAlumno(overrides?: Partial<Alumno>): Alumno {
  return {
    legajo: "12345",
    nombre: "Juan",
    apellido: "Garcia",
    githubUsername: "juangarcia",
    email: "juan@example.com",
    comision: "miércoles noche",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Alumnos page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAlumnos.mockResolvedValue([]);
    await AdminAlumnosPage();
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  describe("estado vacío", () => {
    it("muestra mensaje cuando no hay alumnos", async () => {
      mockGetAlumnos.mockResolvedValue([]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay alumnos ingresados");
    });

    it("muestra 0 alumnos en el subtítulo", async () => {
      mockGetAlumnos.mockResolvedValue([]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("0 alumnos");
    });
  });

  describe("con alumnos", () => {
    it("muestra la tabla cuando hay alumnos", async () => {
      mockGetAlumnos.mockResolvedValue([makeAlumno()]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("<table");
    });

    it("muestra la cantidad de alumnos en el subtítulo", async () => {
      mockGetAlumnos.mockResolvedValue([makeAlumno(), makeAlumno({ legajo: "67890" })]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("2 alumnos");
    });

    it("muestra el legajo del alumno", async () => {
      mockGetAlumnos.mockResolvedValue([makeAlumno({ legajo: "99999" })]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("99999");
    });

    it("muestra el nombre completo en formato Apellido, Nombre", async () => {
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ nombre: "María", apellido: "Pérez" }),
      ]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Pérez");
      expect(html).toContain("María");
    });

    it("muestra el username de GitHub con link al perfil", async () => {
      mockGetAlumnos.mockResolvedValue([makeAlumno({ githubUsername: "marialambda" })]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("marialambda");
      expect(html).toContain("https://github.com/marialambda");
    });

    it("muestra el email del alumno", async () => {
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ email: "maria@example.com" }),
      ]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("maria@example.com");
    });

    it("muestra las cabeceras de la tabla", async () => {
      mockGetAlumnos.mockResolvedValue([makeAlumno()]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Legajo");
      expect(html).toContain("Nombre");
      expect(html).toContain("GitHub");
      expect(html).toContain("Email");
    });

    it("renderiza una fila por alumno", async () => {
      mockGetAlumnos.mockResolvedValue([
        makeAlumno({ legajo: "111" }),
        makeAlumno({ legajo: "222" }),
        makeAlumno({ legajo: "333" }),
      ]);

      const element = await AdminAlumnosPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("111");
      expect(html).toContain("222");
      expect(html).toContain("333");
    });
  });
});
