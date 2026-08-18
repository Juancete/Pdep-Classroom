import { render, screen } from "@testing-library/react";
import { IconLink } from "./IconLink";
import { EyeIcon } from "./icons";

describe("IconLink", () => {
  it("linkea al href correcto con nombre accesible según el label", () => {
    render(<IconLink href="/admin/assignments/a1" label="Ver" Icon={EyeIcon} />);
    const link = screen.getByRole("link", { name: "Ver" });
    expect(link).toHaveAttribute("href", "/admin/assignments/a1");
  });

  it("no muestra el label como texto visible, solo el ícono", () => {
    render(<IconLink href="/x" label="Ver" Icon={EyeIcon} />);
    const link = screen.getByRole("link", { name: "Ver" });
    expect(link).not.toHaveTextContent("Ver");
    expect(link.querySelector("svg")).toBeInTheDocument();
  });
});
