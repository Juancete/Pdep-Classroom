import { render, screen } from "@testing-library/react";
import { Paginador } from "./Paginador";

describe("Paginador", () => {
  it("no renderiza nada con una sola página", () => {
    const { container } = render(
      <Paginador page={1} totalPages={1} hrefDePagina={(page) => `/x?page=${page}`} ariaLabel="Paginación" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada sin páginas", () => {
    const { container } = render(
      <Paginador page={1} totalPages={0} hrefDePagina={(page) => `/x?page=${page}`} ariaLabel="Paginación" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("deshabilita 'Anterior' en la primera página", () => {
    render(
      <Paginador page={1} totalPages={3} hrefDePagina={(page) => `/x?page=${page}`} ariaLabel="Paginación" />
    );
    expect(screen.queryByRole("link", { name: "← Anterior" })).not.toBeInTheDocument();
    expect(screen.getByText("← Anterior")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Siguiente →" })).toHaveAttribute("href", "/x?page=2");
  });

  it("deshabilita 'Siguiente' en la última página", () => {
    render(
      <Paginador page={3} totalPages={3} hrefDePagina={(page) => `/x?page=${page}`} ariaLabel="Paginación" />
    );
    expect(screen.queryByRole("link", { name: "Siguiente →" })).not.toBeInTheDocument();
    expect(screen.getByText("Siguiente →")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Anterior" })).toHaveAttribute("href", "/x?page=2");
  });

  it("habilita ambos extremos en una página intermedia y arma los hrefs correctos", () => {
    render(
      <Paginador page={2} totalPages={5} hrefDePagina={(page) => `/x?page=${page}&q=perez`} ariaLabel="Paginación de alumnos" />
    );
    expect(screen.getByRole("link", { name: "← Anterior" })).toHaveAttribute("href", "/x?page=1&q=perez");
    expect(screen.getByRole("link", { name: "Siguiente →" })).toHaveAttribute("href", "/x?page=3&q=perez");
    expect(screen.getByText("Página 2 de 5")).toBeInTheDocument();
  });

  it("aplica el aria-label recibido", () => {
    render(
      <Paginador page={1} totalPages={2} hrefDePagina={(page) => `/x?page=${page}`} ariaLabel="Paginación de alumnos" />
    );
    expect(screen.getByRole("navigation", { name: "Paginación de alumnos" })).toBeInTheDocument();
  });
});
