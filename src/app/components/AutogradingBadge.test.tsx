import { render, screen } from "@testing-library/react";
import { AutogradingBadge } from "./AutogradingBadge";

describe("AutogradingBadge", () => {
  it("muestra la etiqueta correspondiente al resultado", () => {
    render(<AutogradingBadge resultadoNombre="aprobado" />);
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
  });

  it("muestra 'Tests fallidos' para fallido", () => {
    render(<AutogradingBadge resultadoNombre="fallido" />);
    expect(screen.getByText("Tests fallidos")).toBeInTheDocument();
  });

  it("sin runUrl no envuelve el badge en un link", () => {
    render(<AutogradingBadge resultadoNombre="aprobado" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("con runUrl envuelve el badge en un link que abre en ventana nueva", () => {
    render(
      <AutogradingBadge
        resultadoNombre="aprobado"
        runUrl="https://github.com/org/repo/actions/runs/1"
      />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://github.com/org/repo/actions/runs/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("el título incluye el detalle del resultado", () => {
    render(<AutogradingBadge resultadoNombre="sin_autograding" />);
    expect(screen.getByText("Sin autograding")).toHaveAttribute(
      "title",
      expect.stringContaining("no tiene un workflow de autograding")
    );
  });
});
