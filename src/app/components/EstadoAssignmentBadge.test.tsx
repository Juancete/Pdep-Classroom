import { render, screen } from "@testing-library/react";
import { EstadoAssignmentBadge } from "./EstadoAssignmentBadge";
import { EstadoAssignment, NOMBRES_ESTADO_ASSIGNMENT } from "@/domain/entities";

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

  // Fase 4 de la auditoría de dominio: la tabla de presentación de este
  // badge duplica a propósito el texto de `EstadoAssignment.etiqueta()`
  // (evita arrastrar `@/domain/entities` al bundle de cliente). Este test
  // ata las dos copias para que una futura divergencia rompa el build.
  describe("coherencia con EstadoAssignment", () => {
    it.each(NOMBRES_ESTADO_ASSIGNMENT)("la etiqueta de '%s' coincide con el dominio", (nombre) => {
      render(<EstadoAssignmentBadge estado={nombre} />);
      expect(
        screen.getByText(EstadoAssignment.desdeNombre(nombre).etiqueta())
      ).toBeInTheDocument();
    });
  });
});
