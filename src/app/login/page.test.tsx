import { describe, it, expect, vi } from "vitest";
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
});
