import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("./logout-button", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

import { NavMenu } from "./nav-menu";

describe("NavMenu", () => {
  it("señala la acción pendiente antes de abrir el menú mobile", async () => {
    render(
      <NavMenu
        links={[]}
        username="juangarcia"
        image=""
        isAdmin={false}
        hasPendingSync
      />
    );

    const trigger = screen.getByRole("button", {
      name: /acción pendiente en tu perfil/i,
    });
    const user = userEvent.setup();
    await user.click(trigger);

    expect(
      screen.getByRole("link", {
        name: /Editar perfil, acción pendiente/i,
      })
    ).toHaveAttribute("href", "/perfil");
  });
});
