import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
}));

import LoginPage from "./page";

// ── Tests ────────────────────────────────────────────────────

describe("Login page", () => {
  it("renderiza el título de inicio de sesión", () => {
    const element = LoginPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Iniciar sesión");
  });

  it("renderiza el botón para continuar con GitHub", () => {
    const element = LoginPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Continuar con GitHub");
  });

  it("renderiza el hint sobre la cuenta de GitHub", () => {
    const element = LoginPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("planilla");
  });

  it("renderiza un formulario con un botón de submit", () => {
    const element = LoginPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
  });

  it("no muestra el modo desarrollo fuera de NODE_ENV=development", () => {
    const element = LoginPage();
    const html = renderToStaticMarkup(element);
    expect(html).not.toContain('data-testid="dev-login"');
  });

  describe("modo desarrollo", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAdmins = process.env.ADMIN_GITHUB_USERNAMES;

    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    afterEach(() => {
      vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
      vi.stubEnv("ADMIN_GITHUB_USERNAMES", originalAdmins ?? "");
    });

    it("aparece cuando NODE_ENV es development", () => {
      const element = LoginPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="dev-login"');
    });

    it("ofrece un botón de acceso directo por cada admin configurado", () => {
      vi.stubEnv("ADMIN_GITHUB_USERNAMES", "juancete, fdodino");
      const element = LoginPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Entrar como juancete (docente)");
      expect(html).toContain("Entrar como fdodino (docente)");
    });

    it("no ofrece botones de admin si no hay ninguno configurado", () => {
      vi.stubEnv("ADMIN_GITHUB_USERNAMES", "");
      const element = LoginPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("(docente)");
    });

    it("siempre ofrece un campo de texto para entrar como cualquier alumno", () => {
      const element = LoginPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("GitHub username para entrar como alumno");
    });
  });
});
