import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import NotFound from "./not-found";

describe("NotFound", () => {
  it("muestra el título de página no encontrada", () => {
    render(<NotFound />);
    expect(screen.getByText("Página no encontrada")).toBeInTheDocument();
  });

  it("muestra un texto breve explicando el error", () => {
    render(<NotFound />);
    expect(
      screen.getByText(/La página que buscás no existe o fue movida/)
    ).toBeInTheDocument();
  });

  it("muestra un link que apunta a la página de inicio", () => {
    render(<NotFound />);
    const link = screen.getByText("Volver al inicio");
    expect(link).toHaveAttribute("href", "/");
  });
});
