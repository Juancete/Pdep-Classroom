import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrupoSelector } from "./grupo-selector";
import type { GrupoResumen } from "./mi-grupo";

// ── Mocks ────────────────────────────────────────────────────

const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

// ── Helpers ──────────────────────────────────────────────────

function makeGrupo(overrides: Partial<GrupoResumen> = {}): GrupoResumen {
  return {
    id: "g1",
    nombre: "Los Lambdas",
    paradigma: "objetos",
    maxIntegrantes: 3,
    estaLleno: false,
    etiquetaCupo: "1/3 integrantes",
    miembros: ["bob"],
    tieneRepoActivo: false,
    ...overrides,
  };
}

function mockFetch(ok: boolean, data: object = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, json: async () => data })
  );
}

// ── Tests ────────────────────────────────────────────────────

describe("GrupoSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterRefresh.mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("inscripciones cerradas", () => {
    it("muestra mensaje de inscripciones cerradas", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[]}
          inscripcionesCerradas={true}
        />
      );
      expect(screen.getByTestId("inscripciones-cerradas")).toBeInTheDocument();
      expect(screen.getByText(/Las inscripciones están cerradas/)).toBeInTheDocument();
    });

    it("no muestra el formulario de creación si están cerradas", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[]}
          inscripcionesCerradas={true}
        />
      );
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });

  describe("sin grupos disponibles", () => {
    it("muestra el formulario de crear grupo", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[]}
          inscripcionesCerradas={false}
        />
      );
      expect(screen.getByRole("textbox", { name: /nombre del grupo/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /crear/i })).toBeInTheDocument();
    });

    it("el botón Crear está deshabilitado si el nombre está vacío", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[]}
          inscripcionesCerradas={false}
        />
      );
      expect(screen.getByRole("button", { name: /crear/i })).toBeDisabled();
    });
  });

  describe("con grupos abiertos", () => {
    it("muestra la lista de grupos con cupo", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo({ nombre: "Los Lambdas" }), makeGrupo({ id: "g2", nombre: "Los Monads" })]}
          inscripcionesCerradas={false}
        />
      );
      expect(screen.getByText("Los Lambdas")).toBeInTheDocument();
      expect(screen.getByText("Los Monads")).toBeInTheDocument();
    });

    it("avisa que el grupo ya tiene repositorio y que al unirse va a recibir acceso", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo({ tieneRepoActivo: true })]}
          inscripcionesCerradas={false}
        />
      );
      expect(screen.getByText(/Ya aceptó el TP/)).toBeInTheDocument();
      expect(screen.getByText(/vas a recibir acceso al repositorio/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unirme y recibir acceso" })).toBeInTheDocument();
    });

    it("no muestra el aviso cuando el grupo todavía no aceptó el TP", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo({ tieneRepoActivo: false })]}
          inscripcionesCerradas={false}
        />
      );
      expect(screen.queryByText(/Ya aceptó el TP/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Unirme" })).toBeInTheDocument();
    });

    it("no muestra grupos llenos", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo({ estaLleno: true, nombre: "Grupo Lleno" })]}
          inscripcionesCerradas={false}
        />
      );
      expect(screen.queryByText("Grupo Lleno")).not.toBeInTheDocument();
    });

    it("muestra mensaje cuando todos los grupos están llenos", () => {
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo({ estaLleno: true })]}
          inscripcionesCerradas={false}
        />
      );
      expect(
        screen.getByText(/todos los grupos están completos/i)
      ).toBeInTheDocument();
    });
  });

  describe("crear grupo", () => {
    it("pide confirmación mencionando el nombre del grupo a crear", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      mockFetch(true);
      render(
        <GrupoSelector assignmentId="a1" grupos={[]} inscripcionesCerradas={false} />
      );

      await user.type(screen.getByRole("textbox"), "Los Lambdas");
      await user.click(screen.getByRole("button", { name: /crear/i }));

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('crear el grupo "Los Lambdas"')
      );
    });

    it("no llama a fetch si se cancela la confirmación al crear", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      mockFetch(true);
      render(
        <GrupoSelector assignmentId="a1" grupos={[]} inscripcionesCerradas={false} />
      );

      await user.type(screen.getByRole("textbox"), "Los Lambdas");
      await user.click(screen.getByRole("button", { name: /crear/i }));

      expect(fetch).not.toHaveBeenCalled();
      expect(mockRouterRefresh).not.toHaveBeenCalled();
    });

    it("llama al endpoint correcto con el nombre ingresado", async () => {
      const user = userEvent.setup();
      mockFetch(true);
      render(
        <GrupoSelector assignmentId="a1" grupos={[]} inscripcionesCerradas={false} />
      );

      await user.type(screen.getByRole("textbox"), "Los Lambdas");
      await user.click(screen.getByRole("button", { name: /crear/i }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/grupos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: "Los Lambdas" }),
        });
      });
    });

    it("llama a router.refresh() después de crear exitosamente", async () => {
      const user = userEvent.setup();
      mockFetch(true);
      render(
        <GrupoSelector assignmentId="a1" grupos={[]} inscripcionesCerradas={false} />
      );

      await user.type(screen.getByRole("textbox"), "Los Lambdas");
      await user.click(screen.getByRole("button", { name: /crear/i }));

      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("muestra error del servidor si la creación falla", async () => {
      const user = userEvent.setup();
      mockFetch(false, { error: "Ya estás en un grupo para este TP" });
      render(
        <GrupoSelector assignmentId="a1" grupos={[]} inscripcionesCerradas={false} />
      );

      await user.type(screen.getByRole("textbox"), "Los Lambdas");
      await user.click(screen.getByRole("button", { name: /crear/i }));

      expect(
        await screen.findByText("Ya estás en un grupo para este TP")
      ).toBeInTheDocument();
    });
  });

  describe("unirse a grupo", () => {
    it("pide confirmación mencionando el nombre del grupo al que se une", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      mockFetch(true);
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo({ nombre: "Los Monads" })]}
          inscripcionesCerradas={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /unirme/i }));

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('unirte al grupo "Los Monads"')
      );
    });

    it("no llama a fetch si se cancela la confirmación al unirse", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      mockFetch(true);
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo()]}
          inscripcionesCerradas={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /unirme/i }));

      expect(fetch).not.toHaveBeenCalled();
      expect(mockRouterRefresh).not.toHaveBeenCalled();
    });

    it("llama al endpoint de join con el grupoId correcto", async () => {
      const user = userEvent.setup();
      mockFetch(true);
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo({ id: "g42" })]}
          inscripcionesCerradas={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /unirme/i }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          "/api/assignments/a1/grupos/g42/join",
          { method: "POST" }
        );
      });
    });

    it("llama a router.refresh() después de unirse exitosamente", async () => {
      const user = userEvent.setup();
      mockFetch(true);
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo()]}
          inscripcionesCerradas={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /unirme/i }));

      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("muestra error si el grupo está lleno al momento de unirse", async () => {
      const user = userEvent.setup();
      mockFetch(false, { error: "El grupo ya está completo" });
      render(
        <GrupoSelector
          assignmentId="a1"
          grupos={[makeGrupo()]}
          inscripcionesCerradas={false}
        />
      );

      await user.click(screen.getByRole("button", { name: /unirme/i }));

      expect(
        await screen.findByText("El grupo ya está completo")
      ).toBeInTheDocument();
    });
  });
});
