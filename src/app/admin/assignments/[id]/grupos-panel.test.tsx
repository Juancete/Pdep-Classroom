import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GruposPanel } from "./grupos-panel";
import type { GrupoAdminResumen, AlumnoSinGrupoResumen } from "./grupos-panel";

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
    tieneEntrega: false,
    miembros: [
      { username: "ana", nombreCompleto: "García, Ana" },
      { username: "bob", nombreCompleto: "Smith, Bob" },
    ],
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

  describe("toggle inscripciones", () => {
    it('muestra "Cerrar inscripciones" cuando están abiertas', () => {
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getByTestId("toggle-inscripciones")).toHaveTextContent(
        "Cerrar inscripciones"
      );
    });

    it('muestra "Abrir inscripciones" cuando están cerradas', () => {
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={true}
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getByTestId("toggle-inscripciones")).toHaveTextContent(
        "Abrir inscripciones"
      );
    });

    it("llama al endpoint correcto con cerrada=true al cerrar", async () => {
      const user = userEvent.setup();
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getByTestId("toggle-inscripciones"));

      expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/inscripciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: true }),
      });
    });

    it("llama al endpoint correcto con cerrada=false al abrir", async () => {
      const user = userEvent.setup();
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={true}
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getByTestId("toggle-inscripciones"));

      expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/inscripciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: false }),
      });
    });

    it("llama a router.refresh() después del toggle exitoso", async () => {
      const user = userEvent.setup();
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getByTestId("toggle-inscripciones"));

      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("muestra error si el toggle falla", async () => {
      const user = userEvent.setup();
      mockFetch(false, { error: "Sin permisos" });
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getByTestId("toggle-inscripciones"));

      expect(await screen.findByText("Sin permisos")).toBeInTheDocument();
    });
  });

  describe("lista de grupos", () => {
    it("muestra el nombre de cada grupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
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
          inscripcionesCerradas={false}
          grupos={[]}
          alumnosSinGrupo={[makeAlumnoSinGrupo(), makeAlumnoSinGrupo({ username: "diana" })]}
        />
      );
      expect(screen.getByText(/Sin grupo \(2\)/)).toBeInTheDocument();
    });
  });

  describe("quitar integrante", () => {
    it("llama al DELETE del alumno y refresca tras confirmar", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo()]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          "/api/assignments/a1/grupos/g1/miembros/ana",
          { method: "DELETE" }
        );
      });
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("no llama a fetch si se cancela la confirmación", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo()]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      expect(fetch).not.toHaveBeenCalled();
    });

    it("la confirmación advierte sobre los colaboradores cuando el grupo ya entregó", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo({ tieneEntrega: true })]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining("colaboradores desincronizados")
      );
    });

    it("no advierte sobre colaboradores cuando el grupo no entregó", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo({ tieneEntrega: false })]}
          alumnosSinGrupo={[]}
        />
      );

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.not.stringContaining("colaboradores")
      );
    });
  });

  describe("mover integrante", () => {
    it("no muestra 'Mover a…' si no hay otro grupo con cupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo()]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("el botón Mover está deshabilitado hasta elegir un grupo destino", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo({ id: "g1" }), makeGrupo({ id: "g2", nombre: "Los Monoides", miembros: [] })]}
          alumnosSinGrupo={[]}
        />
      );
      expect(screen.getAllByRole("button", { name: /^mover$/i })[0]).toBeDisabled();
    });

    it("llama al PUT del grupo elegido y refresca", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo({ id: "g1" }), makeGrupo({ id: "g2", nombre: "Los Monoides", miembros: [] })]}
          alumnosSinGrupo={[]}
        />
      );

      await user.selectOptions(screen.getAllByRole("combobox")[0], "g2");
      await user.click(screen.getAllByRole("button", { name: /^mover$/i })[0]);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          "/api/assignments/a1/grupos/g2/miembros/ana",
          { method: "PUT" }
        );
      });
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });
  });

  describe("agregar alumno sin grupo", () => {
    it("no muestra el selector si ningún grupo tiene cupo", () => {
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
          grupos={[makeGrupo({ estaLleno: true })]}
          alumnosSinGrupo={[makeAlumnoSinGrupo()]}
        />
      );
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("llama al PUT del grupo elegido y refresca", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(true);
      render(
        <GruposPanel
          assignmentId="a1"
          inscripcionesCerradas={false}
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
  });
});
