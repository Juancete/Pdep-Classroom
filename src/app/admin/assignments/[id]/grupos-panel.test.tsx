import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GruposPanel } from "./grupos-panel";
import type { AlumnoSinGrupoResumen } from "./grupos-panel";
import type { GrupoAdminResumen } from "../../grupo-resumen";

// ── Mocks ────────────────────────────────────────────────────

const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

// ── Helpers ──────────────────────────────────────────────────

function makeGrupo(overrides: Partial<GrupoAdminResumen> = {}): GrupoAdminResumen {
  return {
    id: "g1",
    nombre: "Los Lambdas",
    maxIntegrantes: 3,
    estaLleno: false,
    etiquetaCupo: "2/3 integrantes",
    tipoDeIntegrantes: "alumnos",
    miembros: [
      { username: "ana", nombreCompleto: "García, Ana" },
      { username: "bob", nombreCompleto: "Smith, Bob" },
    ],
    destinos: [],
    ...overrides,
  };
}

function makeAlumnoSinGrupo(overrides: Partial<AlumnoSinGrupoResumen> = {}): AlumnoSinGrupoResumen {
  return { username: "carlos", nombreCompleto: "López, Carlos", ...overrides };
}

function mockFetch(ok: boolean, data: object = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => data })
  );
}

// ── Tests ────────────────────────────────────────────────────

describe("GruposPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterRefresh.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("lista de grupos", () => {
    it("muestra el nombre de cada grupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo({ nombre: "Los Lambdas" }), makeGrupo({ id: "g2", nombre: "Los Monads" })]}
          alumnosSinGrupo={[]}
        />
      );
      // selector acotado: sin él, el nombre también aparece como opción del
      // "Mover a…" de los integrantes del otro grupo.
      expect(screen.getByText("Los Lambdas", { selector: "span.font-medium" })).toBeInTheDocument();
      expect(screen.getByText("Los Monads", { selector: "span.font-medium" })).toBeInTheDocument();
    });

    it("muestra el nombre completo y username de cada miembro", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo()]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getByText("García, Ana")).toBeInTheDocument();
      expect(screen.getByText("@ana")).toBeInTheDocument();
    });

    it("muestra mensaje cuando no hay grupos", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getByText(/no hay grupos/i)).toBeInTheDocument();
    });

    it("muestra el contador de grupos en el encabezado", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo(), makeGrupo({ id: "g2" })]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getByText(/Grupos \(2\)/)).toBeInTheDocument();
    });

    it('muestra badge "Completo" para grupos llenos', () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo({ estaLleno: true, maxIntegrantes: 2, etiquetaCupo: "Completo (2/2)" })]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getByText("Completo (2/2)")).toBeInTheDocument();
    });
  });

  describe("alumnos sin grupo", () => {
    it("muestra la sección cuando hay alumnos sin grupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[]}
          alumnosSinGrupo={[makeAlumnoSinGrupo()]}
        />
      );
      expect(screen.getByTestId("alumnos-sin-grupo")).toBeInTheDocument();
    });

    it("no muestra la sección cuando todos tienen grupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.queryByTestId("alumnos-sin-grupo")).not.toBeInTheDocument();
    });

    it("muestra el nombre completo y username del alumno sin grupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[]}
          alumnosSinGrupo={[{ username: "pedro", nombreCompleto: "Pérez, Pedro" }]}
        />
      );
      expect(screen.getByText("Pérez, Pedro")).toBeInTheDocument();
      expect(screen.getByText("@pedro")).toBeInTheDocument();
    });

    it("muestra el contador de alumnos sin grupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[]}
          alumnosSinGrupo={[makeAlumnoSinGrupo(), makeAlumnoSinGrupo({ username: "diana" })]}
        />
      );
      expect(screen.getByText(/Sin grupo \(2\)/)).toBeInTheDocument();
    });
  });

  describe("cards de grupo", () => {
    it("renderiza una card por grupo, con sus acciones", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[
            makeGrupo({ id: "g1", destinos: [{ id: "g2", nombre: "Los Monads", conEntrega: false }] }),
            makeGrupo({ id: "g2", nombre: "Los Monads" }),
          ]}
          alumnosSinGrupo={[]}
        />
      );
      const lista = screen.getByTestId("grupos-list");
      expect(within(lista).getByText("Los Lambdas")).toBeInTheDocument();
      expect(within(lista).getByText("Los Monads", { selector: "span.font-medium" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^quitar$/i })).toHaveLength(4);
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("las cards reciben acciones: hay Quitar por cada miembro", () => {
      render(<GruposPanel assignmentId="a1" grupos={[makeGrupo()]} alumnosSinGrupo={[]} />);
      expect(screen.getAllByRole("button", { name: /^quitar$/i })).toHaveLength(2);
    });

    it('muestra el badge "Repo creado" del grupo con entrega', () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo({ entrega: { estadoRepo: "activo" } })]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getByText("Repo creado")).toBeInTheDocument();
    });
  });

  describe("agregar alumno sin grupo", () => {
    it("no muestra el selector si ningún grupo tiene cupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo({ estaLleno: true })]}
          alumnosSinGrupo={[makeAlumnoSinGrupo()]}
        />
      );
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("la confirmación nombra al alumno y al grupo al que se lo agrega", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo({ id: "g2", nombre: "Los Monoides" })]}
          alumnosSinGrupo={[makeAlumnoSinGrupo({ username: "carlos", nombreCompleto: "López, Carlos" })]}
        />
      );

      await user.selectOptions(screen.getByRole("combobox"), "g2");
      await user.click(screen.getByRole("button", { name: /^agregar$/i }));

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('agregar a López, Carlos (@carlos) al grupo "Los Monoides"')
      );
    });

    it("llama al PUT del grupo elegido y refresca", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[makeGrupo({ id: "g2", nombre: "Los Monoides" })]}
          alumnosSinGrupo={[makeAlumnoSinGrupo({ username: "carlos" })]}
        />
      );

      await user.selectOptions(screen.getByRole("combobox"), "g2");
      await user.click(screen.getByRole("button", { name: /^agregar$/i }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          "/api/assignments/a1/grupos/g2/miembros/carlos",
          { method: "PUT" }
        );
      });
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    // issue #107: un alumno sin grupo nunca puede sumarse a un grupo de
    // docentes desde este selector.
    it("no ofrece grupos de docentes para agregar a un alumno sin grupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          grupos={[
            makeGrupo({
              id: "g2",
              nombre: "Docentes Team",
              tipoDeIntegrantes: "docentes",
            }),
          ]}
          alumnosSinGrupo={[makeAlumnoSinGrupo({ username: "carlos" })]}
        />
      );

      // El grupo de docentes sigue listado (con su propio encabezado), pero
      // no aparece como opción del selector "Agregar a…" — de ahí que la
      // aserción relevante sea la ausencia del combobox, no del texto.
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });
});
