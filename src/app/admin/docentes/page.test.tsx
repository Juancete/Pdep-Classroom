import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireResponsable = vi.fn();
const mockGetDocentes = vi.fn();
const mockResponsablesDeEntorno = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireResponsable: () => mockRequireResponsable(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getDocentes: () => mockGetDocentes(),
}));

vi.mock("@/lib/responsables-de-entorno", () => ({
  responsablesDeEntorno: () => mockResponsablesDeEntorno(),
}));

// Las actions se mockean con `vi.fn()` creados adentro de la factory (en vez
// de referenciar una `const` de más arriba) para no pisar la restricción de
// hoisting de `vi.mock` — después se importan de vuelta más abajo para
// poder comparar identidad con lo que `page.tsx` le pasa por props a cada
// componente (issue #90: acá interesa que sean la misma referencia que
// exporta `./actions`, no mockear su comportamiento).
vi.mock("./actions", () => ({
  crearDocenteAction: vi.fn(),
  renombrarDocenteAction: vi.fn(),
  cambiarEstadoDocenteAction: vi.fn(),
}));

// Los mocks de `DocenteForm`/`NombreEditable`/`EstadoToggle` son
// `vi.fn()` (no sólo componentes) para poder inspeccionar con qué props los
// llamó `page.tsx`.
type DocenteFormProps = { action: unknown };
const mockDocenteForm = vi.fn((_props: DocenteFormProps) => (
  <div data-testid="docente-form" />
));
vi.mock("./docente-form", () => ({
  DocenteForm: (props: DocenteFormProps) => mockDocenteForm(props),
}));

type NombreEditableProps = { nombre: string | null; action: unknown };
type EstadoToggleProps = { activo: boolean; action: unknown };
const mockNombreEditable = vi.fn(({ nombre }: NombreEditableProps) => (
  <span>{nombre ?? "sin nombre"}</span>
));
const mockEstadoToggle = vi.fn(({ activo }: EstadoToggleProps) => (
  <button>{activo ? "Desactivar" : "Reactivar"}</button>
));
vi.mock("./docente-acciones", () => ({
  NombreEditable: (props: NombreEditableProps) => mockNombreEditable(props),
  EstadoToggle: (props: EstadoToggleProps) => mockEstadoToggle(props),
}));

import AdminDocentesPage from "./page";
import {
  crearDocenteAction as mockCrearDocenteAction,
  renombrarDocenteAction as mockRenombrarDocenteAction,
  cambiarEstadoDocenteAction as mockCambiarEstadoDocenteAction,
} from "./actions";

// ── Helpers ──────────────────────────────────────────────────

function makeDocente(overrides?: Partial<{ id: string; githubUsername: string; nombre: string | null; activo: boolean }>) {
  return { id: "a1", githubUsername: "ayudante1", nombre: null, activo: true, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Docentes page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue(undefined);
    mockResponsablesDeEntorno.mockReturnValue([]);
  });

  it("pasa las actions reales de ./actions por props a los tres componentes (issue #90)", async () => {
    mockGetDocentes.mockResolvedValue([makeDocente({ githubUsername: "ayudante1" })]);
    renderToStaticMarkup(await AdminDocentesPage());

    expect(mockDocenteForm).toHaveBeenCalledWith(
      expect.objectContaining({ action: mockCrearDocenteAction })
    );
    expect(mockNombreEditable).toHaveBeenCalledWith(
      expect.objectContaining({ action: mockRenombrarDocenteAction })
    );
    expect(mockEstadoToggle).toHaveBeenCalledWith(
      expect.objectContaining({ action: mockCambiarEstadoDocenteAction })
    );
  });

  it("siempre llama a requireResponsable", async () => {
    mockGetDocentes.mockResolvedValue([]);
    await AdminDocentesPage();
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("muestra el estado vacío cuando no hay filas", async () => {
    mockGetDocentes.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AdminDocentesPage());
    expect(html).toContain("No hay nadie configurado todavía.");
  });

  it("usa 'Docentes' como título visible", async () => {
    mockGetDocentes.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AdminDocentesPage());
    expect(html).toContain("Docentes");
  });

  it("muestra a los responsables de entorno con badge 'Entorno' y sin acciones", async () => {
    mockGetDocentes.mockResolvedValue([]);
    mockResponsablesDeEntorno.mockReturnValue(["juancete"]);
    const html = renderToStaticMarkup(await AdminDocentesPage());
    expect(html).toContain("@juancete");
    expect(html).toContain("Entorno");
    expect(html).toContain("Protegido");
  });

  it("muestra a los docentes de base con badge 'Aplicación' y acciones", async () => {
    mockGetDocentes.mockResolvedValue([makeDocente({ githubUsername: "ayudante1" })]);
    const html = renderToStaticMarkup(await AdminDocentesPage());
    expect(html).toContain("@ayudante1");
    expect(html).toContain("Aplicación");
    expect(html).toContain("Desactivar");
  });

  it("un username presente en ambos (entorno y base) se renderiza una sola vez, como 'Entorno'", async () => {
    mockGetDocentes.mockResolvedValue([makeDocente({ githubUsername: "juancete" })]);
    mockResponsablesDeEntorno.mockReturnValue(["juancete"]);
    const html = renderToStaticMarkup(await AdminDocentesPage());

    expect(html.match(/@juancete/g)).toHaveLength(1);
    expect(html).toContain("Entorno");
    expect(html).not.toContain("Desactivar");
  });

  it("muestra badge 'Inactivo' para un docente desactivado", async () => {
    mockGetDocentes.mockResolvedValue([
      makeDocente({ githubUsername: "ex-ayudante", activo: false }),
    ]);
    const html = renderToStaticMarkup(await AdminDocentesPage());
    expect(html).toContain("Inactivo");
    expect(html).toContain("Reactivar");
  });

  it("renderiza el formulario de alta", async () => {
    mockGetDocentes.mockResolvedValue([]);
    const html = renderToStaticMarkup(await AdminDocentesPage());
    expect(html).toContain('data-testid="docente-form"');
  });
});
