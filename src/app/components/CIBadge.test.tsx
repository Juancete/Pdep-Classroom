import { render, screen } from "@testing-library/react";
import { CIBadge } from "./CIBadge";

describe("CIBadge", () => {
  it("muestra la etiqueta correspondiente al resultado", () => {
    render(<CIBadge resultadoNombre="passing" />);
    expect(screen.getByText("Passing")).toBeInTheDocument();
  });

  it("muestra 'Failing' para failing", () => {
    render(<CIBadge resultadoNombre="failing" />);
    expect(screen.getByText("Failing")).toBeInTheDocument();
  });

  it("sin detalleUrl no envuelve el badge en un link", () => {
    render(<CIBadge resultadoNombre="passing" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("con detalleUrl envuelve el badge en un link que abre en ventana nueva", () => {
    render(
      <CIBadge
        resultadoNombre="passing"
        detalleUrl="https://github.com/org/repo/commit/abc123/checks"
      />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://github.com/org/repo/commit/abc123/checks");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("el título incluye el detalle del resultado", () => {
    render(<CIBadge resultadoNombre="sin_ci" />);
    expect(screen.getByText("Sin CI")).toHaveAttribute(
      "title",
      expect.stringContaining("no tiene checks de CI")
    );
  });
});
