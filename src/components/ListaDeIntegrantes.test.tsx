import { render, screen } from "@testing-library/react";
import { ListaDeIntegrantes } from "./ListaDeIntegrantes";
import type { IntegranteResumen } from "@/domain/entities";

function integrante(overrides: Partial<IntegranteResumen> = {}): IntegranteResumen {
  return {
    username: "ana",
    nombreCompleto: "García, Ana",
    tieneAccesoAlRepo: false,
    ...overrides,
  };
}

describe("ListaDeIntegrantes", () => {
  it("muestra el nombre completo y el @username", () => {
    render(<ListaDeIntegrantes integrantes={[integrante()]} tieneRepo={false} />);
    expect(screen.getByText("García, Ana")).toBeInTheDocument();
    expect(screen.getByText("@ana")).toBeInTheDocument();
  });

  it("muestra sólo el @username cuando no hay nombre completo", () => {
    render(
      <ListaDeIntegrantes
        integrantes={[integrante({ nombreCompleto: null })]}
        tieneRepo={false}
      />
    );
    expect(screen.queryByText("García, Ana")).not.toBeInTheDocument();
    expect(screen.getByText("@ana")).toBeInTheDocument();
  });

  it("no renderiza ningún chip cuando tieneRepo es false", () => {
    render(
      <ListaDeIntegrantes
        integrantes={[integrante({ tieneAccesoAlRepo: true }), integrante({ username: "bob", tieneAccesoAlRepo: false })]}
        tieneRepo={false}
      />
    );
    expect(screen.queryByText("Con acceso al repo")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin acceso al repo")).not.toBeInTheDocument();
  });

  it("con tieneRepo=true, muestra 'Con acceso al repo' para quien tiene acceso", () => {
    render(
      <ListaDeIntegrantes integrantes={[integrante({ tieneAccesoAlRepo: true })]} tieneRepo={true} />
    );
    expect(screen.getByText("Con acceso al repo")).toBeInTheDocument();
  });

  it("con tieneRepo=true, muestra 'Sin acceso al repo' para quien no tiene acceso", () => {
    render(
      <ListaDeIntegrantes
        integrantes={[integrante({ tieneAccesoAlRepo: false })]}
        tieneRepo={true}
      />
    );
    expect(screen.getByText("Sin acceso al repo")).toBeInTheDocument();
  });

  it("una lista vacía se renderiza sin romper", () => {
    render(<ListaDeIntegrantes integrantes={[]} tieneRepo={true} />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
