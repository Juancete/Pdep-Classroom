import { render, screen } from "@testing-library/react";
import { EstadoAssignmentBadge } from "./EstadoAssignmentBadge";

describe("EstadoAssignmentBadge", () => {
  it("muestra la etiqueta de borrador", () => {
    render(<EstadoAssignmentBadge estado="borrador" />);
    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });

  it("muestra la etiqueta de publicado", () => {
    render(<EstadoAssignmentBadge estado="publicado" />);
    expect(screen.getByText("Publicado")).toBeInTheDocument();
  });

  it("muestra la etiqueta de archivado", () => {
    render(<EstadoAssignmentBadge estado="archivado" />);
    expect(screen.getByText("Archivado")).toBeInTheDocument();
  });
});
