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

import { DeleteComisionButton } from "./delete-button";

describe("DeleteComisionButton", () => {
  it("pasa el mensaje de confirmación con el año de la comisión", () => {
    render(<DeleteComisionButton id="c1" anio={2024} />);
    expect(screen.getByTestId("delete-btn")).toHaveAttribute(
      "data-message",
      "¿Eliminar la comisión 2024? Esta acción no se puede deshacer."
    );
  });

  it("pasa el endpoint correcto con el id de la comisión", () => {
    render(<DeleteComisionButton id="c99" anio={2025} />);
    expect(screen.getByTestId("delete-btn")).toHaveAttribute(
      "data-endpoint",
      "/api/comisiones/c99"
    );
  });
});
