import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import { DOCENTE, ESTUDIANTE } from "@/domain/entities";
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
    render(<UserMenu username="juangarcia" image="https://github.com/juangarcia.png" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    expect(screen.getByText("juangarcia")).toBeInTheDocument();
  });

  it("renderiza el avatar con el src correcto", () => {
    const { container } = render(
      <UserMenu username="juangarcia" image="https://github.com/juangarcia.png" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://github.com/juangarcia.png");
  });

  it("no muestra el menú hasta hacer click en el trigger", () => {
    render(<UserMenu username="juangarcia" image="" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("abre el menú al hacer click en el trigger", async () => {
    render(<UserMenu username="juangarcia" image="" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    await openMenu("juangarcia");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("click afuera (en el overlay) cierra el menú", async () => {
    render(<UserMenu username="juangarcia" image="" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    const user = await openMenu("juangarcia");

    await user.click(screen.getByTestId("cerrar-menu"));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Escape cierra el menú", async () => {
    render(<UserMenu username="juangarcia" image="" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    const user = await openMenu("juangarcia");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("elegir un ítem cierra el menú", async () => {
    render(<UserMenu username="juangarcia" image="" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    const user = await openMenu("juangarcia");

    await user.click(screen.getByRole("menuitem", { name: "Editar perfil" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("llama a signOut con callbackUrl '/' al hacer click en Salir", async () => {
    render(<UserMenu username="juangarcia" image="" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    const user = await openMenu("juangarcia");

    await user.click(screen.getByRole("menuitem", { name: "Salir" }));

    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });

  it("muestra el link Editar perfil para alumnos", async () => {
    render(<UserMenu username="juangarcia" image="" itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()} />);
    await openMenu("juangarcia");
    expect(screen.getByRole("menuitem", { name: "Editar perfil" })).toHaveAttribute(
      "href",
      "/perfil"
    );
  });

  it("no muestra el link Editar perfil para admins", async () => {
    render(<UserMenu username="admin" image="" itemsDeCuenta={DOCENTE.itemsDeCuenta()} />);
    await openMenu("admin");
    expect(
      screen.queryByRole("menuitem", { name: "Editar perfil" })
    ).not.toBeInTheDocument();
  });

  it("muestra errores pendientes para admins y limita el badge visual", async () => {
    render(<UserMenu username="admin" image="" itemsDeCuenta={DOCENTE.itemsDeCuenta()} unreadErrors={120} />);
    await openMenu("admin");
    expect(screen.getByRole("menuitem", { name: /Errores.*120 sin leer/i })).toHaveAttribute(
      "href",
      "/admin/errores"
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("señala en el avatar y en Editar perfil cuando hay una acción pendiente", async () => {
    render(
      <UserMenu
        username="juangarcia"
        image=""
        itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()}
        hasPendingSync
      />
    );

    const trigger = screen.getByRole("button", {
      name: /acción pendiente en tu perfil/i,
    });
    expect(trigger).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(trigger);
    expect(
      screen.getByRole("menuitem", {
        name: /Editar perfil, acción pendiente/i,
      })
    ).toHaveAttribute("href", "/perfil");
  });
});
