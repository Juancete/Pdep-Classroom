import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepoDeEntrega } from "./RepoDeEntrega";

describe("RepoDeEntrega", () => {
  it("con repo activo muestra el link al repo en una pestaña nueva", () => {
    render(<RepoDeEntrega estadoRepo="activo" repoUrl="https://github.com/org/repo" />);

    const link = screen.getByRole("link", { name: /Ir al repo/ });
    expect(link).toHaveAttribute("href", "https://github.com/org/repo");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("con repo borrado avisa y no muestra link", () => {
    render(<RepoDeEntrega estadoRepo="borrado" repoUrl="https://github.com/org/repo" />);

    expect(screen.getByText("Repositorio borrado")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("sin repo lo indica y no muestra link", () => {
    render(<RepoDeEntrega estadoRepo="sin-repo" />);

    expect(screen.getByText("Sin repo")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
