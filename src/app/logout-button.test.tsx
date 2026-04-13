import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import { UserMenu } from "./logout-button";

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

  it("llama a signOut con callbackUrl '/' al hacer click en Salir", async () => {
    const user = userEvent.setup();
    render(<UserMenu username="juangarcia" image="" />);

    await user.click(screen.getByRole("button", { name: "Salir" }));

    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
