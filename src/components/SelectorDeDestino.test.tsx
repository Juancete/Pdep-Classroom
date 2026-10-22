import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectorDeDestino } from "./SelectorDeDestino";

const DESTINOS = [
  { id: "g1", nombre: "Grupo 1" },
  { id: "g2", nombre: "Grupo 2" },
];

function renderizar(
  props: Partial<React.ComponentProps<typeof SelectorDeDestino>> = {}
) {
  const onCambio = vi.fn();
  const onConfirmar = vi.fn();
  render(
    <SelectorDeDestino
      destinos={DESTINOS}
      valor=""
      onCambio={onCambio}
      textoVacio="Mover a…"
      ariaLabel="Elegir destino"
      claseDelSelect="select-x"
      accion={{ etiquetaBoton: "Mover", className: "boton-x", onConfirmar }}
      {...props}
    />
  );
  return { onCambio, onConfirmar };
}

describe("SelectorDeDestino", () => {
  it("muestra la opción vacía y los destinos", () => {
    renderizar();

    expect(screen.getByRole("option", { name: "Mover a…" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Grupo 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Grupo 2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Elegir destino")).toHaveClass("select-x");
  });

  it("deshabilita el botón mientras no hay selección", () => {
    renderizar({ valor: "" });

    expect(screen.getByRole("button", { name: "Mover" })).toBeDisabled();
  });

  it("llama a onCambio con el id elegido", async () => {
    const { onCambio } = renderizar();

    await userEvent.setup().selectOptions(screen.getByLabelText("Elegir destino"), "g2");

    expect(onCambio).toHaveBeenCalledWith("g2");
  });

  it("con selección habilita el botón y llama a onConfirmar al hacer click", async () => {
    const { onConfirmar } = renderizar({ valor: "g1" });
    const boton = screen.getByRole("button", { name: "Mover" });

    expect(boton).toBeEnabled();
    await userEvent.setup().click(boton);

    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it("deshabilita select y botón con `disabled`", () => {
    renderizar({ valor: "g1", disabled: true });

    expect(screen.getByLabelText("Elegir destino")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover" })).toBeDisabled();
  });
});
