import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MiGrupo } from "./mi-grupo";
import type { GrupoResumen } from "./mi-grupo";
import type { GrupoDisponible } from "./acciones-de-membresia";
import type { IntegranteResumen } from "@/domain/entities";

vi.mock("@/app/dashboard/accept-button", () => ({
  AcceptButton: ({
    assignmentId,
    etiqueta = "Aceptar",
  }: {
    assignmentId: string;
    etiqueta?: string;
  }) => (
    <button data-testid="accept-button" data-assignment={assignmentId}>
      {etiqueta}
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

// Issue #138: dos integrantes, uno con nombre completo y otro sin (docente
// de demo o alumno sin fila en `Alumno`) — mismo par que usan los tests de
// `ListaDeIntegrantes`.
function makeIntegrantes(overrides: Partial<IntegranteResumen>[] = []): IntegranteResumen[] {
  const base: IntegranteResumen[] = [
    { username: "ana", nombreCompleto: "García, Ana", tieneAccesoAlRepo: false },
    { username: "bob", nombreCompleto: null, tieneAccesoAlRepo: false },
  ];
  return base.map((integrante, indice) => ({ ...integrante, ...overrides[indice] }));
}

function makeProps(overrides: Partial<React.ComponentProps<typeof MiGrupo>> = {}) {
  return {
    grupo: makeGrupo(),
    assignmentId: "a1",
    tieneRepo: false,
    tieneAccesoAlRepo: false,
    integrantes: makeIntegrantes(),
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

  // Issue #138: la lista de integrantes viene de la prop `integrantes`
  // (resuelta por `Grupo.resumenDeIntegrantes` en el server component), no
  // de `grupo.miembros` — este test cubre nombre completo + chips.
  it("muestra el nombre completo de los integrantes que lo tienen", () => {
    render(<MiGrupo {...makeProps()} />);
    expect(screen.getByText("García, Ana")).toBeInTheDocument();
  });

  it("no muestra chips de acceso cuando tieneRepo es false", () => {
    render(<MiGrupo {...makeProps({ tieneRepo: false })} />);
    expect(screen.queryByText("Con acceso al repo")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin acceso al repo")).not.toBeInTheDocument();
  });

  it("muestra chips de acceso por integrante cuando tieneRepo es true", () => {
    render(
      <MiGrupo
        {...makeProps({
          tieneRepo: true,
          integrantes: makeIntegrantes([
            { tieneAccesoAlRepo: true },
            { tieneAccesoAlRepo: false },
          ]),
        })}
      />
    );
    expect(screen.getByText("Con acceso al repo")).toBeInTheDocument();
    expect(screen.getByText("Sin acceso al repo")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Pedir acceso" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceptar" })).not.toBeInTheDocument();
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
