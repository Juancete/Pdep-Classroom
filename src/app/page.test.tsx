import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Importar la página DESPUÉS de los mocks
import Home from "./page";

// ── Tests ────────────────────────────────────────────────────

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  describe("cuando el usuario está autenticado", () => {
    it("redirige a /dashboard", async () => {
      mockGetCurrentUser.mockResolvedValue({
        githubUsername: "testuser",
        rol: ESTUDIANTE,
      });

      await expect(Home()).rejects.toThrow("REDIRECT:/dashboard");
      expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
    });

    it("redirige también si es admin", async () => {
      mockGetCurrentUser.mockResolvedValue({
        githubUsername: "adminuser",
        rol: DOCENTE,
      });

      await expect(Home()).rejects.toThrow("REDIRECT:/dashboard");
      expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
    });
  });

  describe("cuando no hay usuario autenticado", () => {
    beforeEach(() => {
      mockGetCurrentUser.mockResolvedValue(null);
      // Para estos tests, redirect NO debe lanzar (no debería ser llamado)
    });

    it("muestra el título del sitio", async () => {
      const element = await Home();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("PdeP Classroom");
    });

    it("muestra el link para ir al login", async () => {
      const element = await Home();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('href="/login"');
    });

    it("muestra el texto del botón de GitHub", async () => {
      const element = await Home();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Entrar con GitHub");
    });

    it("muestra la descripción de la materia", async () => {
      const element = await Home();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Paradigmas de Programación");
      expect(html).toContain("UTN FRBA");
    });

    it("no llama a redirect", async () => {
      await Home();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
