import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import { UserMenu } from "./logout-button";

async function openMenu(username: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: new RegExp(username) }));
  return user;
}

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el username", () => {
    render(<UserMenu username="juangarcia" image="https://github.com/juangarcia.png" />);
    expect(screen.getByText("juangarcia")).toBeInTheDocument();
  });

  it("renderiza el avatar con el src correcto", () => {
    const { container } = render(
      <UserMenu username="juangarcia" image="https://github.com/juangarcia.png" />
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://github.com/juangarcia.png");
  });

  it("no muestra el menú hasta hacer click en el trigger", () => {
    render(<UserMenu username="juangarcia" image="" />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("abre el menú al hacer click en el trigger", async () => {
    render(<UserMenu username="juangarcia" image="" />);
    await openMenu("juangarcia");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("llama a signOut con callbackUrl '/' al hacer click en Salir", async () => {
    render(<UserMenu username="juangarcia" image="" />);
    const user = await openMenu("juangarcia");

    await user.click(screen.getByRole("menuitem", { name: "Salir" }));

    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("muestra el link Editar perfil para alumnos", async () => {
    render(<UserMenu username="juangarcia" image="" isAdmin={false} />);
    await openMenu("juangarcia");
    expect(screen.getByRole("menuitem", { name: "Editar perfil" })).toHaveAttribute(
      "href",
      "/perfil"
    );
  });

  it("no muestra el link Editar perfil para admins", async () => {
    render(<UserMenu username="admin" image="" isAdmin={true} />);
    await openMenu("admin");
    expect(
      screen.queryByRole("menuitem", { name: "Editar perfil" })
    ).not.toBeInTheDocument();
  });

  it("muestra Editar perfil por defecto (sin isAdmin)", async () => {
    render(<UserMenu username="juangarcia" image="" />);
    await openMenu("juangarcia");
    expect(screen.getByRole("menuitem", { name: "Editar perfil" })).toBeInTheDocument();
  });
});
