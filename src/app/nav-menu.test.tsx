import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("./logout-button", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

const mockUseErrorLogCount = vi.fn((enabled: boolean) => {
  void enabled;
  return 0;
});
vi.mock("./use-error-log-count", () => ({
  useErrorLogCount: (enabled: boolean) => mockUseErrorLogCount(enabled),
}));

import { NavMenu } from "./nav-menu";

describe("NavMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseErrorLogCount.mockReturnValue(0);
  });
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

  it("muestra los errores pendientes en el menú mobile del docente", async () => {
    mockUseErrorLogCount.mockReturnValue(4);
    render(<NavMenu links={[]} username="admin" image="" isAdmin />);
    const trigger = screen.getByRole("button", { name: /4 errores sin leer/i });
    await userEvent.setup().click(trigger);
    expect(screen.getByRole("link", { name: /Errores.*4 sin leer/i })).toHaveAttribute(
      "href",
      "/admin/errores"
    );
  });
});
