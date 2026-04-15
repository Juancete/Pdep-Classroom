import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockAuth = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockUpsertAlumno = vi.fn();
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
  upsertAlumno: (...args: unknown[]) => mockUpsertAlumno(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/app/components/AlumnoForm", () => ({
  AlumnoForm: ({ defaultValues }: { defaultValues: { githubUsername: string; email: string; nombre: string; apellido: string } }) => (
    <div
      data-testid="alumno-form"
      data-github={defaultValues.githubUsername}
      data-email={defaultValues.email}
      data-nombre={defaultValues.nombre}
    />
  ),
}));

import RegistroPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeSession(githubUsername: string, overrides?: Partial<PdepUser>) {
  const pdepUser: PdepUser = {
    githubUsername,
    name: "Test User",
    image: "",
    isAdmin: false,
    ...overrides,
  };
  return {
    pdepUser,
    user: { email: "test@example.com", name: "Test User" },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Registro page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    mockGetComisionActiva.mockResolvedValue(null);
    mockUpsertAlumno.mockResolvedValue(undefined);
  });

  describe("redirecciones", () => {
    it("redirige a /login si no hay sesión", async () => {
      mockAuth.mockResolvedValue(null);

      await expect(RegistroPage()).rejects.toThrow("REDIRECT:/login");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirige a /dashboard si el alumno ya está registrado", async () => {
      mockAuth.mockResolvedValue(makeSession("juangarcia"));
      mockGetAlumnoByGithub.mockResolvedValue({
        legajo: "12345",
        nombre: "Juan",
        apellido: "Garcia",
        githubUsername: "juangarcia",
        email: "juan@example.com",
        comision: "miércoles noche",
      });

      await expect(RegistroPage()).rejects.toThrow("REDIRECT:/dashboard");
      expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
    });

    it("hace upsert en la DB cuando el alumno es reconocido desde la planilla", async () => {
      const alumno = {
        legajo: "12345",
        nombre: "Juan",
        apellido: "Garcia",
        githubUsername: "juangarcia",
        email: "juan@example.com",
      };
      mockAuth.mockResolvedValue(makeSession("juangarcia"));
      mockGetAlumnoByGithub.mockResolvedValue(alumno);

      await expect(RegistroPage()).rejects.toThrow("REDIRECT:/dashboard");
      // comisionActiva es null en el mock → comision: undefined en el upsert
      expect(mockUpsertAlumno).toHaveBeenCalledWith({ ...alumno, comision: undefined });
    });

    it("hace upsert con la comisión activa cuando existe", async () => {
      const comision = { id: "c1", spreadsheetId: "s1", columnConfig: null };
      mockGetComisionActiva.mockResolvedValue(comision);
      const alumno = { legajo: "12345", nombre: "Juan", apellido: "G", githubUsername: "j", email: "j@j.com" };
      mockAuth.mockResolvedValue(makeSession("j"));
      mockGetAlumnoByGithub.mockResolvedValue(alumno);

      await expect(RegistroPage()).rejects.toThrow("REDIRECT:/dashboard");
      expect(mockUpsertAlumno).toHaveBeenCalledWith({ ...alumno, comision });
    });

    it("no hace upsert si el alumno no está en la planilla", async () => {
      mockAuth.mockResolvedValue(makeSession("nuevouser"));
      mockGetAlumnoByGithub.mockResolvedValue(null);

      await RegistroPage();
      expect(mockUpsertAlumno).not.toHaveBeenCalled();
    });
  });

  describe("render cuando el alumno no está registrado", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(makeSession("nuevouser"));
      mockGetAlumnoByGithub.mockResolvedValue(null);
    });

    it("muestra el título de registro", async () => {
      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Registro");
    });

    it("muestra el nombre de usuario de GitHub vinculado", async () => {
      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("nuevouser");
    });

    it("renderiza el AlumnoForm", async () => {
      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="alumno-form"');
    });

    it("pasa el githubUsername correcto al AlumnoForm", async () => {
      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-github="nuevouser"');
    });

    it("pasa el email de la sesión al AlumnoForm", async () => {
      const session = makeSession("nuevouser");
      mockAuth.mockResolvedValue(session);

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-email="test@example.com"');
    });

    it("pasa el nombre spliteado de la sesión al AlumnoForm", async () => {
      const session = makeSession("nuevouser");
      mockAuth.mockResolvedValue(session);

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      // "Test User" → nombre: "Test", apellido: "User"
      expect(html).toContain('data-nombre="Test"');
    });

    it("consulta por el username correcto en sheets", async () => {
      await RegistroPage();
      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith("nuevouser", undefined, undefined);
    });

    it("usa el spreadsheetId y columnConfig de la comisión activa", async () => {
      const comision = {
        spreadsheetId: "sheet-xyz",
        columnConfig: { sheetName: "Alumnos", headerRows: 1, legajo: 0, apellido: 1, nombre: 2, githubUsername: 3, email: 4, comision: 5 },
      };
      mockGetComisionActiva.mockResolvedValue(comision);
      mockAuth.mockResolvedValue(makeSession("nuevouser"));
      mockGetAlumnoByGithub.mockResolvedValue(null);

      await RegistroPage();

      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith(
        "nuevouser",
        "sheet-xyz",
        comision.columnConfig
      );
    });

    it("no redirige a /login ni /dashboard", async () => {
      await RegistroPage();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
