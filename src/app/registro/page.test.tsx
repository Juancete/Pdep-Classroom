import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockAuth = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/sheets", () => ({
  getAlumnoByGithub: (username: string) => mockGetAlumnoByGithub(username),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("./registro-form", () => ({
  RegistroForm: ({
    githubUsername,
    email,
    nombre,
  }: {
    githubUsername: string;
    email: string;
    nombre: string;
  }) => (
    <div
      data-testid="registro-form"
      data-github={githubUsername}
      data-email={email}
      data-nombre={nombre}
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

    it("renderiza el formulario de registro", async () => {
      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("data-testid=\"registro-form\"");
    });

    it("pasa el githubUsername correcto al RegistroForm", async () => {
      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-github="nuevouser"');
    });

    it("pasa el email de la sesión al RegistroForm", async () => {
      const session = makeSession("nuevouser");
      mockAuth.mockResolvedValue(session);

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-email="test@example.com"');
    });

    it("pasa el nombre de la sesión al RegistroForm", async () => {
      const session = makeSession("nuevouser");
      mockAuth.mockResolvedValue(session);

      const element = await RegistroPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-nombre="Test User"');
    });

    it("consulta por el username correcto en sheets", async () => {
      await RegistroPage();
      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith("nuevouser");
    });

    it("no redirige a /login ni /dashboard", async () => {
      await RegistroPage();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
