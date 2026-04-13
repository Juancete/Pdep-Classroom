import { render, screen } from "@testing-library/react";

vi.mock("../delete-button", () => ({
  DeleteButton: ({
    confirmMessage,
    endpoint,
  }: {
    confirmMessage: string;
    endpoint: string;
  }) => (
    <div
      data-testid="delete-btn"
      data-message={confirmMessage}
      data-endpoint={endpoint}
    />
  ),
}));

import { DeleteAssignmentButton } from "./delete-button";

describe("DeleteAssignmentButton", () => {
  it("pasa el mensaje de confirmación con el título del assignment", () => {
    render(<DeleteAssignmentButton id="abc" titulo="Kata Funcional" />);
    expect(screen.getByTestId("delete-btn")).toHaveAttribute(
      "data-message",
      '¿Eliminar "Kata Funcional"? Esta acción no se puede deshacer.'
    );
  });

  it("pasa el endpoint correcto con el id del assignment", () => {
    render(<DeleteAssignmentButton id="abc123" titulo="TP Objetos" />);
    expect(screen.getByTestId("delete-btn")).toHaveAttribute(
      "data-endpoint",
      "/api/assignments/abc123"
    );
  });
});
