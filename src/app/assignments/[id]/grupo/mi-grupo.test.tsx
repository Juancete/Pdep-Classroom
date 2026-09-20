import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MiGrupo } from "./mi-grupo";
import type { GrupoResumen } from "./mi-grupo";
import type { GrupoDisponible } from "./acciones-de-membresia";

vi.mock("@/app/dashboard/accept-button", () => ({
  AcceptButton: ({ assignmentId }: { assignmentId: string }) => (
    <button data-testid="accept-button" data-assignment={assignmentId}>
      Aceptar TP
    </button>
  ),
}));

vi.mock("./acciones-de-membresia", () => ({
  AccionesDeMembresia: (props: {
    grupoId: string;
    githubUsername: string;
    motivoBloqueo: string | null;
    esUltimoMiembro: boolean;
    gruposDisponibles: GrupoDisponible[];
  }) => (
    <div
      data-testid="acciones-de-membresia"
      data-grupo={props.grupoId}
      data-username={props.githubUsername}
      data-motivo={props.motivoBloqueo ?? ""}
      data-ultimo={String(props.esUltimoMiembro)}
      data-disponibles={props.gruposDisponibles.length}
    >
      AccionesDeMembresia
    </div>
  ),
}));

function makeGrupo(overrides: Partial<GrupoResumen> = {}): GrupoResumen {
  const base: GrupoResumen = {
    id: "g1",
    nombre: "Los Lambdas",
    paradigma: "objetos",
    maxIntegrantes: 3,
    estaLleno: false,
    etiquetaCupo: "2/3 integrantes",
    miembros: ["ana", "bob"],
    tieneRepoActivo: false,
    ...overrides,
  };
  return base;
}

function makeProps(overrides: Partial<React.ComponentProps<typeof MiGrupo>> = {}) {
  return {
    grupo: makeGrupo(),
    assignmentId: "a1",
    tieneRepo: false,
    tieneAccesoAlRepo: false,
    githubUsername: "ana",
    motivoBloqueo: null,
    esUltimoMiembro: false,
    gruposDisponibles: [] as GrupoDisponible[],
    ...overrides,
  };
}

describe("MiGrupo", () => {
  it("muestra el nombre del grupo", () => {
    render(<MiGrupo {...makeProps()} />);
    expect(screen.getByText("Los Lambdas")).toBeInTheDocument();
  });

  it("lista los usernames de los miembros", () => {
    render(<MiGrupo {...makeProps()} />);
    expect(screen.getByText("@ana")).toBeInTheDocument();
    expect(screen.getByText("@bob")).toBeInTheDocument();
  });

  it("muestra el contador de integrantes cuando el grupo no está lleno", () => {
    render(
      <MiGrupo
        {...makeProps({
          grupo: makeGrupo({ estaLleno: false, etiquetaCupo: "2/3 integrantes" }),
        })}
      />
    );
    expect(screen.getByText("2/3 integrantes")).toBeInTheDocument();
  });

  it("muestra 'Completo' cuando el grupo está lleno", () => {
    render(
      <MiGrupo
        {...makeProps({
          grupo: makeGrupo({ estaLleno: true, etiquetaCupo: "Completo (2/2)" }),
        })}
      />
    );
    expect(screen.getByText("Completo (2/2)")).toBeInTheDocument();
  });

  it("muestra AcceptButton cuando no tiene repositorio", () => {
    render(<MiGrupo {...makeProps({ tieneRepo: false })} />);
    expect(screen.getByTestId("accept-button")).toBeInTheDocument();
    expect(screen.getByTestId("accept-button")).toHaveAttribute("data-assignment", "a1");
  });

  // Una entrega pendiente o fallida existe pero no tiene `hasRepo()`: el
  // grupo tiene que poder reintentar (ambas llegan como tieneRepo=false).
  it("muestra el botón de aceptar cuando la entrega del grupo quedó fallida", () => {
    render(<MiGrupo {...makeProps({ tieneRepo: false, tieneAccesoAlRepo: true })} />);
    expect(screen.getByTestId("accept-button")).toBeInTheDocument();
    expect(screen.getByText(/aceptá el TP para crear el repositorio/)).toBeInTheDocument();
  });

  it("muestra el botón de aceptar cuando la entrega quedó pendiente", () => {
    render(<MiGrupo {...makeProps({ tieneRepo: false, tieneAccesoAlRepo: false })} />);
    expect(screen.getByTestId("accept-button")).toBeInTheDocument();
  });

  it("ofrece pedir acceso cuando el repo existe pero el integrante no figura como colaborador", () => {
    render(<MiGrupo {...makeProps({ tieneRepo: true, tieneAccesoAlRepo: false })} />);
    expect(screen.getByText(/todavía no tenés acceso/)).toBeInTheDocument();
    expect(screen.getByTestId("accept-button")).toHaveAttribute("data-assignment", "a1");
  });

  it("no muestra ningún botón de aceptar cuando el repo existe y el integrante ya tiene acceso", () => {
    render(<MiGrupo {...makeProps({ tieneRepo: true, tieneAccesoAlRepo: true })} />);
    expect(screen.queryByTestId("accept-button")).not.toBeInTheDocument();
  });

  it("sigue bloqueando la salida del grupo cuando el grupo ya tiene entrega", () => {
    render(
      <MiGrupo
        {...makeProps({
          tieneRepo: true,
          tieneAccesoAlRepo: true,
          motivoBloqueo: "El grupo ya aceptó el TP",
        })}
      />
    );
    expect(screen.getByTestId("acciones-de-membresia")).toHaveAttribute(
      "data-motivo",
      "El grupo ya aceptó el TP"
    );
  });

  it("le pasa a AccionesDeMembresia el grupo, el username y el motivo de bloqueo", () => {
    render(
      <MiGrupo
        {...makeProps({
          motivoBloqueo: "El grupo ya entregó.",
          esUltimoMiembro: true,
          gruposDisponibles: [{ id: "g2", nombre: "Los Monoides" }],
        })}
      />
    );
    const acciones = screen.getByTestId("acciones-de-membresia");
    expect(acciones).toHaveAttribute("data-grupo", "g1");
    expect(acciones).toHaveAttribute("data-username", "ana");
    expect(acciones).toHaveAttribute("data-motivo", "El grupo ya entregó.");
    expect(acciones).toHaveAttribute("data-ultimo", "true");
    expect(acciones).toHaveAttribute("data-disponibles", "1");
  });
});
