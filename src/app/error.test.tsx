import { render, screen } from "@testing-library/react";
import GlobalError from "./error";

describe("GlobalError", () => {
  it("muestra el título genérico de error", () => {
    render(<GlobalError error={new Error("cualquier cosa")} />);
    expect(screen.getByText("Algo salió mal")).toBeInTheDocument();
  });

  it("muestra el mensaje del error recibido", () => {
    render(<GlobalError error={new Error("Connection refused")} />);
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("muestra el texto de recarga", () => {
    render(<GlobalError error={new Error("x")} />);
    expect(
      screen.getByText(/Podés intentar recargar la página/)
    ).toBeInTheDocument();
  });

  it("renderiza el mensaje con estilo mono rojo", () => {
    render(<GlobalError error={new Error("DB timeout")} />);
    const msg = screen.getByText("DB timeout");
    expect(msg).toHaveClass("font-mono");
    expect(msg).toHaveClass("text-red-500");
  });
});
