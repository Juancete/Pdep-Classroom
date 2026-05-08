import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MiGrupo } from "./mi-grupo";
import type { GrupoResumen } from "./mi-grupo";

vi.mock("@/app/dashboard/accept-button", () => ({
  AcceptButton: ({ assignmentId }: { assignmentId: string }) => (
    <button data-testid="accept-button" data-assignment={assignmentId}>
      Aceptar TP
    </button>
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
    ...overrides,
  };
  return base;
}

describe("MiGrupo", () => {
  it("muestra el nombre del grupo", () => {
    render(<MiGrupo grupo={makeGrupo()} assignmentId="a1" tieneEntrega={false} />);
    expect(screen.getByText("Los Lambdas")).toBeInTheDocument();
  });

  it("lista los usernames de los miembros", () => {
    render(<MiGrupo grupo={makeGrupo()} assignmentId="a1" tieneEntrega={false} />);
    expect(screen.getByText("@ana")).toBeInTheDocument();
    expect(screen.getByText("@bob")).toBeInTheDocument();
  });

  it("muestra el contador de integrantes cuando el grupo no está lleno", () => {
    render(
      <MiGrupo
        grupo={makeGrupo({ estaLleno: false, etiquetaCupo: "2/3 integrantes" })}
        assignmentId="a1"
        tieneEntrega={false}
      />
    );
    expect(screen.getByText("2/3 integrantes")).toBeInTheDocument();
  });

  it("muestra 'Completo' cuando el grupo está lleno", () => {
    render(
      <MiGrupo
        grupo={makeGrupo({ estaLleno: true, etiquetaCupo: "Completo (2/2)" })}
        assignmentId="a1"
        tieneEntrega={false}
      />
    );
    expect(screen.getByText("Completo (2/2)")).toBeInTheDocument();
  });

  it("muestra AcceptButton cuando no tiene entrega", () => {
    render(<MiGrupo grupo={makeGrupo()} assignmentId="a1" tieneEntrega={false} />);
    expect(screen.getByTestId("accept-button")).toBeInTheDocument();
    expect(screen.getByTestId("accept-button")).toHaveAttribute("data-assignment", "a1");
  });

  it("no muestra AcceptButton cuando ya tiene entrega", () => {
    render(<MiGrupo grupo={makeGrupo()} assignmentId="a1" tieneEntrega={true} />);
    expect(screen.queryByTestId("accept-button")).not.toBeInTheDocument();
  });
});
