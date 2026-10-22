import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities";
import type { ItemDeCuenta } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockEstadoDelUsuarioActual = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/application/estadoDeSincronizacion", () => ({
  estadoDeSincronizacionDelUsuarioActual: () => mockEstadoDelUsuarioActual(),
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

// NavMenu real es un client component con hooks; acá sólo interesa qué le
// pasa `Nav`, así que se reemplaza por un stub que expone sus props.
vi.mock("@/components/layout/nav-menu", () => ({
  NavMenu: ({
    links,
    username,
    isAdmin,
    hasPendingSync,
    itemsDeCuenta,
  }: {
    links: { href: string; label: string }[];
    username: string;
    isAdmin: boolean;
    hasPendingSync?: boolean;
    itemsDeCuenta: ItemDeCuenta[];
  }) => (
    <div
      data-testid="nav-menu"
      data-pending={String(hasPendingSync)}
      data-admin={String(isAdmin)}
      data-cuenta={itemsDeCuenta.map((item) => item.href).join(",")}
    >
      {username}
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          {link.label}
        </a>
      ))}
    </div>
  ),
}));

import { Nav } from "@/components/layout/nav";

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
    mockEstadoDelUsuarioActual.mockResolvedValue(null);
  });

  it("muestra el nombre de la app", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain("PdeP");
    expect(html).toContain("Classroom");
  });

  it("sin sesión muestra sólo el logo: ni links ni menú", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Nav());
    expect(html).not.toContain("nav-menu");
    expect(html).not.toContain("Mis TPs");
    expect(html).not.toContain("Assignments");
  });

  it("muestra link a Mis TPs cuando hay sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain("Mis TPs");
    expect(html).toContain('href="/dashboard"');
  });

  it("el docente ve los links de admin, con Mis TPs al final", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    const html = renderToStaticMarkup(await Nav());
    for (const href of ["/admin/assignments", "/admin/grupos", "/admin/comisiones", "/admin/alumnos"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html.indexOf('href="/admin/assignments"')).toBeLessThan(
      html.indexOf('href="/dashboard"')
    );
  });

  it("el alumno no ve links de admin", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
    const html = renderToStaticMarkup(await Nav());
    expect(html).not.toContain('href="/admin/assignments"');
  });

  it("pasa el username del usuario al menú", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ githubUsername: "pepelopez" }));
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain("pepelopez");
  });

  it("pasa al menú los ítems de cuenta del rol del usuario", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    expect(renderToStaticMarkup(await Nav())).toContain('data-cuenta="/admin/errores"');

    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: ESTUDIANTE }));
    expect(renderToStaticMarkup(await Nav())).toContain('data-cuenta="/perfil"');
  });

  it("el docente no tiene sincronización pendiente", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser({ rol: DOCENTE }));
    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain('data-pending="false"');
    expect(html).toContain('data-admin="true"');
  });

  it("pasa hasPendingSync al menú del alumno con pendientes", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
    mockEstadoDelUsuarioActual.mockResolvedValue({
      hayPendientes: true,
      mensaje: "No pudimos suscribirte al grupo de Google del curso.",
      canalesPendientes: [],
    });

    const html = renderToStaticMarkup(await Nav());
    expect(html).toContain('data-pending="true"');
  });
});
