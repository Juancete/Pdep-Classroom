import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import type { Alumno } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockAuth = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/app/components/AlumnoForm", () => ({
  AlumnoForm: ({ defaultValues }: { defaultValues: { githubUsername: string; legajo?: string; email?: string } }) => (
    <div
      data-testid="alumno-form"
      data-github={defaultValues.githubUsername}
      data-legajo={defaultValues.legajo ?? ""}
      data-email={defaultValues.email ?? ""}
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
  });

  describe("redirecciones", () => {
    it("redirige a /login si no hay sesión", async () => {
      mockAuth.mockResolvedValue(null);

      await expect(PerfilPage()).rejects.toThrow("REDIRECT:/login");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirige a /registro si el alumno no está en la DB", async () => {
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
      expect(html).toContain('data-email="juan@example.com"');
    });

    it("consulta getAlumnoByGithub de la DB con el username de la sesión", async () => {
      await PerfilPage();
      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith("juangarcia");
    });
  });
});
