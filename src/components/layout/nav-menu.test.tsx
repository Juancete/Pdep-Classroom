import { fireEvent, render, screen, within } from "@testing-library/react";
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

import { DOCENTE, ESTUDIANTE } from "@/domain/entities";
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
        itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()}
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
    render(<NavMenu
        links={[]}
        username="admin"
        image=""
        itemsDeCuenta={DOCENTE.itemsDeCuenta()}
        isAdmin
      />);
    const trigger = screen.getByRole("button", { name: /4 errores sin leer/i });
    await userEvent.setup().click(trigger);
    expect(screen.getByRole("link", { name: /Errores.*4 sin leer/i })).toHaveAttribute(
      "href",
      "/admin/errores"
    );
  });

  function renderizarEstudiante() {
    return render(
      <NavMenu
        links={[{ href: "/dashboard", label: "Mis TPs" }]}
        username="juangarcia"
        image=""
        itemsDeCuenta={ESTUDIANTE.itemsDeCuenta()}
        isAdmin={false}
      />
    );
  }

  it("abre el drawer como dialog modal al tocar el botón del menú", async () => {
    const { container } = renderizarEstudiante();
    const trigger = screen.getByRole("button", { name: "Abrir menú" });
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.setup().click(trigger);

    expect(dialog).toHaveAttribute("open");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("el botón Cerrar menú cierra el drawer", async () => {
    const { container } = renderizarEstudiante();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    await user.click(screen.getByRole("button", { name: "Cerrar menú" }));

    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("el evento close del dialog (Escape nativo) sincroniza aria-expanded", async () => {
    const { container } = renderizarEstudiante();
    await userEvent.setup().click(screen.getByRole("button", { name: "Abrir menú" }));
    const trigger = screen.getByRole("button", { name: "Abrir menú" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent(container.querySelector("dialog") as HTMLDialogElement, new Event("close"));

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("click en un link del drawer lo cierra", async () => {
    const { container } = renderizarEstudiante();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dialog = container.querySelector("dialog") as HTMLDialogElement;

    await user.click(within(dialog).getByRole("link", { name: "Mis TPs" }));

    expect(dialog).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("click en el backdrop (el propio dialog) cierra el drawer", async () => {
    const { container } = renderizarEstudiante();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dialog = container.querySelector("dialog") as HTMLDialogElement;

    await user.click(dialog);

    expect(dialog).not.toHaveAttribute("open");
  });

  it("click dentro del contenido del drawer no lo cierra", async () => {
    const { container } = renderizarEstudiante();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dialog = container.querySelector("dialog") as HTMLDialogElement;

    await user.click(within(dialog).getByText("Menú"));

    expect(dialog).toHaveAttribute("open");
  });
});
