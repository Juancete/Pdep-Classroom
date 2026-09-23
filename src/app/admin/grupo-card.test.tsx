import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrupoCard } from "./grupo-card";
import type { GrupoAdminResumen } from "./grupo-resumen";

const mockRouterRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

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

const DESTINO = { id: "g2", nombre: "Los Monoides", conEntrega: false };

function mockFetch(ok: boolean, data: object = {}) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => data }));
}

describe("GrupoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterRefresh.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("encabezado", () => {
    it("muestra el nombre, el cupo y el nombre completo con username de cada miembro", () => {
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);
      expect(screen.getByText("Los Lambdas")).toBeInTheDocument();
      expect(screen.getByText("2/3 integrantes")).toBeInTheDocument();
      expect(screen.getByText("García, Ana")).toBeInTheDocument();
      expect(screen.getByText("@ana")).toBeInTheDocument();
    });

    it('muestra el badge "Docentes" sólo para grupos de docentes', () => {
      const { rerender } = render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);
      expect(screen.queryByText("Docentes")).not.toBeInTheDocument();

      rerender(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ tipoDeIntegrantes: "docentes" })} />);
      expect(screen.getByText("Docentes")).toBeInTheDocument();
    });

    it("muestra título del TP y paradigma sólo si vienen", () => {
      const { rerender } = render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);
      expect(screen.queryByText("TP Funcional")).not.toBeInTheDocument();
      expect(screen.queryByText("funcional")).not.toBeInTheDocument();

      rerender(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({ assignmentTitulo: "TP Funcional", paradigma: "funcional" })}
        />
      );
      expect(screen.getByText("TP Funcional")).toBeInTheDocument();
      expect(screen.getByText("funcional")).toBeInTheDocument();
    });
  });

  describe("entrega", () => {
    it("sin entrega no muestra repo, CI ni badge", () => {
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);
      expect(screen.queryByText("Repo creado")).not.toBeInTheDocument();
      expect(screen.queryByText("Sin repo")).not.toBeInTheDocument();
      expect(screen.queryByText(/Último push/)).not.toBeInTheDocument();
    });

    it("con entrega sólo repo muestra el link y no CI ni último push", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({ entrega: { estadoRepo: "activo", repoUrl: "https://github.com/org/repo" } })}
        />
      );
      expect(screen.getByText("Repo creado")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /ir al repo/i })).toHaveAttribute(
        "href",
        "https://github.com/org/repo"
      );
      expect(screen.queryByText(/Último push/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/CI/i)).not.toBeInTheDocument();
    });

    it("con entrega completa muestra repo, CI y último push", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({
            entrega: {
              estadoRepo: "activo",
              repoUrl: "https://github.com/org/repo",
              ci: { resultadoNombre: "passing", detalleUrl: "https://ci/1" },
              ultimoPush: { fecha: "15/3/2026", por: "ana" },
            },
          })}
        />
      );
      expect(screen.getByRole("link", { name: /ir al repo/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /CI passing/i })).toHaveAttribute(
        "href",
        "https://ci/1"
      );
      expect(screen.getByText("Último push: 15/3/2026 (ana)")).toBeInTheDocument();
    });

    // Issue #122: total de commits del repo, junto a "Último push".
    it("muestra el total de commits del repo cuando viene", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({
            entrega: { estadoRepo: "activo", repoUrl: "https://github.com/org/repo", totalCommits: 7 },
          })}
        />
      );
      expect(screen.getByText("7 commits")).toBeInTheDocument();
    });

    it("usa el singular cuando el repo tiene un solo commit", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({
            entrega: { estadoRepo: "activo", repoUrl: "https://github.com/org/repo", totalCommits: 1 },
          })}
        />
      );
      expect(screen.getByText("1 commit")).toBeInTheDocument();
    });

    it("muestra 'Sin commits' cuando el total es 0", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({
            entrega: { estadoRepo: "activo", repoUrl: "https://github.com/org/repo", totalCommits: 0 },
          })}
        />
      );
      expect(screen.getByText("Sin commits")).toBeInTheDocument();
    });

    it("no muestra nada de commits cuando totalCommits no viene", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({ entrega: { estadoRepo: "activo", repoUrl: "https://github.com/org/repo" } })}
        />
      );
      expect(screen.queryByText(/commit/)).not.toBeInTheDocument();
    });
  });

  // Issue #122: badge de participación junto a cada miembro.
  describe("participación de cada miembro", () => {
    it("muestra el badge de participación cuando el miembro lo trae", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({
            miembros: [
              { username: "ana", nombreCompleto: "García, Ana", participacion: { commits: 6, porcentaje: 60 } },
              { username: "bob", nombreCompleto: "Smith, Bob" },
            ],
          })}
        />
      );
      expect(screen.getByText("60% · 6 commits")).toBeInTheDocument();
    });

    it("no muestra badge de participación cuando el miembro no lo trae", () => {
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });
  });

  describe("quitar integrante", () => {
    it("llama al DELETE del alumno y refresca tras confirmar", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(true);
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/grupos/g1/miembros/ana", {
          method: "DELETE",
        });
      });
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("muestra el error de la API dentro de la card si falla quitar", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(false, { error: "GitHub no respondió" });
      const { container } = render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      const mensaje = await screen.findByText("GitHub no respondió");
      expect(container).toContainElement(mensaje);
    });

    it("no llama a fetch si se cancela la confirmación", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(false);
      mockFetch(true);
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      expect(fetch).not.toHaveBeenCalled();
    });

    it("la confirmación nombra al alumno sobre el que se tocó Quitar y su grupo", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[1]);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('quitar a Smith, Bob (@bob) del grupo "Los Lambdas"')
      );
    });

    it("advierte que quitar al alumno le revoca el acceso al repositorio", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(
        <GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ entrega: { estadoRepo: "activo" } })} />
      );

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining("se le va a revocar el acceso al repositorio")
      );
    });

    it("no advierte sobre el repositorio cuando el grupo no aceptó el TP", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);

      await user.click(screen.getAllByRole("button", { name: /^quitar$/i })[0]);

      expect(confirmSpy).toHaveBeenCalledWith(expect.not.stringContaining("repositorio"));
    });
  });

  describe("mover integrante", () => {
    it("sin destinos no muestra 'Mover a…' ni el botón Mover", () => {
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo()} />);
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^mover$/i })).not.toBeInTheDocument();
    });

    it("las opciones del selector son sólo los destinos", () => {
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({ destinos: [DESTINO, { id: "g3", nombre: "Los Functores", conEntrega: false }] })}
        />
      );
      const opciones = screen.getAllByRole("option").map((opcion) => opcion.textContent);
      expect(opciones.slice(0, 3)).toEqual(["Mover a…", "Los Monoides", "Los Functores"]);
      expect(opciones).toHaveLength(6);
    });

    it("el botón Mover está deshabilitado hasta elegir un grupo destino", () => {
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ destinos: [DESTINO] })} />);
      expect(screen.getAllByRole("button", { name: /^mover$/i })[0]).toBeDisabled();
    });

    it("llama al PUT del grupo elegido y refresca", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(true);
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ destinos: [DESTINO] })} />);

      await user.selectOptions(screen.getAllByRole("combobox")[0], "g2");
      await user.click(screen.getAllByRole("button", { name: /^mover$/i })[0]);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/grupos/g2/miembros/ana", {
          method: "PUT",
        });
      });
      await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalled());
    });

    it("muestra el error de la API si falla mover", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(false, { error: "El grupo está lleno" });
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ destinos: [DESTINO] })} />);

      await user.selectOptions(screen.getAllByRole("combobox")[0], "g2");
      await user.click(screen.getAllByRole("button", { name: /^mover$/i })[0]);

      expect(await screen.findByText("El grupo está lleno")).toBeInTheDocument();
    });

    it("la confirmación nombra al alumno, el grupo de origen y el destino", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ destinos: [DESTINO] })} />);

      await user.selectOptions(screen.getAllByRole("combobox")[1], "g2");
      await user.click(screen.getAllByRole("button", { name: /^mover$/i })[1]);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'mover a Smith, Bob (@bob) del grupo "Los Lambdas" al grupo "Los Monoides"'
        )
      );
    });

    it("la confirmación advierte cuando el grupo destino ya aceptó el TP", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(
        <GrupoCard
          conAcciones
          assignmentId="a1"
          grupo={makeGrupo({ destinos: [{ ...DESTINO, conEntrega: true }] })}
        />
      );

      await user.selectOptions(screen.getAllByRole("combobox")[0], "g2");
      await user.click(screen.getAllByRole("button", { name: /^mover$/i })[0]);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining("se le va a dar acceso al repositorio del grupo destino")
      );
    });

    it("no advierte sobre el destino si éste no tiene entrega", async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ destinos: [DESTINO] })} />);

      await user.selectOptions(screen.getAllByRole("combobox")[0], "g2");
      await user.click(screen.getAllByRole("button", { name: /^mover$/i })[0]);

      expect(confirmSpy).toHaveBeenCalledWith(expect.not.stringContaining("grupo destino"));
    });
  });

  describe("sin acciones", () => {
    it("no muestra selector, Mover, Quitar ni error aunque haya destinos, pero sí los miembros", () => {
      render(
        <GrupoCard
          assignmentId="a1"
          conAcciones={false}
          grupo={makeGrupo({ destinos: [DESTINO], entrega: { estadoRepo: "activo" } })}
        />
      );
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByText("García, Ana")).toBeInTheDocument();
      expect(screen.getByText("@ana")).toBeInTheDocument();
      expect(screen.getByText("Repo creado")).toBeInTheDocument();
    });
  });

  describe("mientras procesa", () => {
    it("deshabilita selects y botones para evitar envíos duplicados", async () => {
      const user = userEvent.setup();
      vi.spyOn(window, "confirm").mockReturnValue(true);
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
      render(<GrupoCard conAcciones assignmentId="a1" grupo={makeGrupo({ destinos: [DESTINO] })} />);

      await user.selectOptions(screen.getAllByRole("combobox")[0], "g2");
      await user.click(screen.getAllByRole("button", { name: /^mover$/i })[0]);

      await waitFor(() => {
        for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
      });
      for (const boton of screen.getAllByRole("button")) expect(boton).toBeDisabled();
    });
  });
});
