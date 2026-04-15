import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import type { Alumno } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockAuth = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/sheets", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
}));

vi.mock("@/lib/repositories", () => ({
  getComisionActiva: () => mockGetComisionActiva(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/app/components/AlumnoForm", () => ({
  AlumnoForm: ({ defaultValues }: { defaultValues: { githubUsername: string; legajo: string } }) => (
    <div
      data-testid="alumno-form"
      data-github={defaultValues.githubUsername}
      data-legajo={defaultValues.legajo}
    />
  ),
}));

import PerfilPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeSession(githubUsername: string) {
  const pdepUser: PdepUser = {
    githubUsername,
    name: "Test User",
    image: "",
    isAdmin: false,
  };
  return {
    pdepUser,
    user: { email: "test@example.com", name: "Test User" },
  };
}

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  return {
    id: "uuid-1",
    legajo: "12345",
    nombre: "Juan",
    apellido: "Garcia",
    githubUsername: "juangarcia",
    email: "juan@example.com",
    comision: undefined,
    ...overrides,
  } as Alumno;
}

// ── Tests ────────────────────────────────────────────────────

describe("Perfil page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    mockGetComisionActiva.mockResolvedValue(null);
  });

  describe("redirecciones", () => {
    it("redirige a /login si no hay sesión", async () => {
      mockAuth.mockResolvedValue(null);

      await expect(PerfilPage()).rejects.toThrow("REDIRECT:/login");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirige a /registro si el alumno no está en la planilla", async () => {
      mockAuth.mockResolvedValue(makeSession("nuevo"));
      mockGetAlumnoByGithub.mockResolvedValue(null);

      await expect(PerfilPage()).rejects.toThrow("REDIRECT:/registro");
      expect(mockRedirect).toHaveBeenCalledWith("/registro");
    });
  });

  describe("render cuando el alumno existe", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(makeSession("juangarcia"));
      mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    });

    it("muestra el título Mi perfil", async () => {
      const element = await PerfilPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Mi perfil");
    });

    it("renderiza el AlumnoForm", async () => {
      const element = await PerfilPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="alumno-form"');
    });

    it("pasa los datos del alumno al AlumnoForm", async () => {
      const element = await PerfilPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-github="juangarcia"');
      expect(html).toContain('data-legajo="12345"');
    });

    it("consulta getAlumnoByGithub con el username de la sesión", async () => {
      await PerfilPage();
      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith(
        "juangarcia",
        undefined,
        undefined
      );
    });

    it("usa el spreadsheetId y columnConfig de la comisión activa", async () => {
      const comision = {
        spreadsheetId: "sheet-abc",
        columnConfig: { sheetName: "Listado", headerRows: 1, legajo: 0, apellido: 1, nombre: 2, githubUsername: 3, email: 4, comision: 5 },
      };
      mockGetComisionActiva.mockResolvedValue(comision);

      await PerfilPage();

      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith(
        "juangarcia",
        "sheet-abc",
        comision.columnConfig
      );
    });
  });
});
