import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities";


// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockResolverEstadoDeSincronizacion = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
}));

vi.mock("@/lib/services/estadoDeSincronizacion", () => ({
  resolverEstadoDeSincronizacion: (...args: unknown[]) =>
    mockResolverEstadoDeSincronizacion(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("./logout-button", () => ({
  UserMenu: ({
    username,
    hasPendingSync,
  }: {
    username: string;
    hasPendingSync?: boolean;
  }) => (
    <div data-testid="user-menu" data-pending={String(hasPendingSync)}>
      {username}
    </div>
  ),
}));

import { Nav } from "./nav";

// ── Helpers ─────────────────────────────────────────────────

function makeUser(overrides: Partial<PdepUser> = {}): PdepUser {
  return {
    githubUsername: "juangarcia",
    name: "Juan García",
    image: "https://github.com/juangarcia.png",
    rol: ESTUDIANTE,
    ...overrides,
  };
}

// ── Nav ──────────────────────────────────────────────────────

describe("Nav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAlumnoByGithub.mockResolvedValue(null);
    mockResolverEstadoDeSincronizacion.mockResolvedValue({
      hayPendientes: false,
      mensaje: "",
      canalesPendientes: [],
    });
  });

  it("muestra el nombre de la app", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain("PdeP");
    expect(html).toContain("Classroom");
  });

  it("muestra link a Mis TPs cuando hay sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain("Mis TPs");
    expect(html).toContain('href="/dashboard"');
  });

  it("no muestra links de nav cuando no hay sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Nav());
    expect(html).not.toContain("Mis TPs");
    expect(html).not.toContain("Assignments");
  });

  it("muestra links de admin cuando el usuario es admin", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain('href="/admin/assignments"');
    expect(html).toContain('href="/admin/grupos"');
    expect(html).toContain('href="/admin/comisiones"');
    expect(html).toContain('href="/admin/alumnos"');
  });

  it("no muestra links de admin para usuario no admin", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
    const html = renderToStaticMarkup(await Nav());
    expect(html).not.toContain('href="/admin/assignments"');
  });

  it("renderiza el UserMenu con el username del usuario", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "pepelopez" }));
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain("pepelopez");
  });

  it("pasa el estado pendiente al menú del alumno", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockGetAlumnoByGithub.mockResolvedValue({ id: "alumno-1" });
    mockResolverEstadoDeSincronizacion.mockResolvedValue({
      hayPendientes: true,
      mensaje: "No pudimos suscribirte al grupo de Google del curso.",
      canalesPendientes: [],
    });

    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain('data-pending="true"');
  });
});

// ── RootLayout ───────────────────────────────────────────────
// RootLayout no se puede testear con renderToStaticMarkup porque
// <Nav /> es async y renderToStaticMarkup es síncrono.
// La estructura del layout (html lang, main wrapper) se verifica
// en tests de integración (e2e).
