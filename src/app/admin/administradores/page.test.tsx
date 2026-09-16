import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireResponsable = vi.fn();
const mockGetAdministradores = vi.fn();
const mockResponsablesDeEntorno = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireResponsable: () => mockRequireResponsable(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAdministradores: () => mockGetAdministradores(),
}));

vi.mock("@/lib/responsables-de-entorno", () => ({
  responsablesDeEntorno: () => mockResponsablesDeEntorno(),
}));

vi.mock("./administrador-form", () => ({
  AdministradorForm: () => <div data-testid="administrador-form" />,
}));

vi.mock("./administrador-acciones", () => ({
  NombreEditable: ({ nombre }: { nombre: string | null }) => <span>{nombre ?? "sin nombre"}</span>,
  EstadoToggle: ({ activo }: { activo: boolean }) => (
    <button>{activo ? "Desactivar" : "Reactivar"}</button>
  ),
}));

import AdminAdministradoresPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAdministrador(overrides?: Partial<{ id: string; githubUsername: string; nombre: string | null; activo: boolean }>) {
  return { id: "a1", githubUsername: "ayudante1", nombre: null, activo: true, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Administradores page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue(undefined);
    mockResponsablesDeEntorno.mockReturnValue([]);
  });

  it("siempre llama a requireResponsable", async () => {
    mockGetAdministradores.mockResolvedValue([]);
    await AdminAdministradoresPage();
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("muestra el estado vacío cuando no hay filas", async () => {
    mockGetAdministradores.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AdminAdministradoresPage());
    expect(html).toContain("No hay nadie configurado todavía.");
  });

  // Terminología: "Administrador" es sólo el nombre técnico de la entidad/
  // tabla/ruta — todo lo visible en la UI dice "docente".
  it("usa 'Docentes' como título visible, no 'Administradores'", async () => {
    mockGetAdministradores.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AdminAdministradoresPage());
    expect(html).toContain("Docentes");
    expect(html).not.toContain(">Administradores<");
  });

  it("muestra a los responsables de entorno con badge 'Entorno' y sin acciones", async () => {
    mockGetAdministradores.mockResolvedValue([]);
    mockResponsablesDeEntorno.mockReturnValue(["juancete"]);
    const html = renderToStaticMarkup(await AdminAdministradoresPage());
    expect(html).toContain("@juancete");
    expect(html).toContain("Entorno");
    expect(html).toContain("Protegido");
  });

  it("muestra a los administradores de base con badge 'Aplicación' y acciones", async () => {
    mockGetAdministradores.mockResolvedValue([makeAdministrador({ githubUsername: "ayudante1" })]);
    const html = renderToStaticMarkup(await AdminAdministradoresPage());
    expect(html).toContain("@ayudante1");
    expect(html).toContain("Aplicación");
    expect(html).toContain("Desactivar");
  });

  it("un username presente en ambos (entorno y base) se renderiza una sola vez, como 'Entorno'", async () => {
    mockGetAdministradores.mockResolvedValue([makeAdministrador({ githubUsername: "juancete" })]);
    mockResponsablesDeEntorno.mockReturnValue(["juancete"]);
    const html = renderToStaticMarkup(await AdminAdministradoresPage());

    expect(html.match(/@juancete/g)).toHaveLength(1);
    expect(html).toContain("Entorno");
    expect(html).not.toContain("Desactivar");
  });

  it("muestra badge 'Inactivo' para un administrador desactivado", async () => {
    mockGetAdministradores.mockResolvedValue([
      makeAdministrador({ githubUsername: "ex-ayudante", activo: false }),
    ]);
    const html = renderToStaticMarkup(await AdminAdministradoresPage());
    expect(html).toContain("Inactivo");
    expect(html).toContain("Reactivar");
  });

  it("renderiza el formulario de alta", async () => {
    mockGetAdministradores.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AdminAdministradoresPage());
    expect(html).toContain('data-testid="administrador-form"');
  });
});
