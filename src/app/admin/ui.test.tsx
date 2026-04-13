import { render, screen } from "@testing-library/react";

// ── Mock useFormStatus ────────────────────────────────────────
const mockUseFormStatus = vi.fn();

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => mockUseFormStatus(),
  };
});

import { FieldError, SubmitButton } from "./ui";

describe("FieldError", () => {
  it("no renderiza nada cuando no hay mensaje", () => {
    const { container } = render(<FieldError />);
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada con mensaje undefined", () => {
    const { container } = render(<FieldError message={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza el mensaje de error", () => {
    render(<FieldError message="Campo requerido" />);
    expect(screen.getByText("Campo requerido")).toBeInTheDocument();
  });

  it("el mensaje tiene clase de error rojo", () => {
    render(<FieldError message="Error" />);
    expect(screen.getByText("Error")).toHaveClass("text-red-600");
  });
});

describe("SubmitButton", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  it("muestra el label recibido", () => {
    render(<SubmitButton label="Guardar" />);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("no está deshabilitado cuando pending=false", () => {
    render(<SubmitButton label="Guardar" />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("está deshabilitado y muestra 'Guardando…' cuando pending=true", () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    render(<SubmitButton label="Guardar" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Guardando…");
  });

  it("es de tipo submit", () => {
    render(<SubmitButton label="Enviar" />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
