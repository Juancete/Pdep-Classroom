import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignOut = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

import { DOCENTE, ESTUDIANTE } from "@/domain/entities";
import { ItemsDeCuenta } from "./items-de-cuenta";

function renderizar(
  props: Partial<React.ComponentProps<typeof ItemsDeCuenta>> = {}
) {
  const onNavegar = vi.fn();
  render(
    <ItemsDeCuenta
      items={ESTUDIANTE.itemsDeCuenta()}
      hasPendingSync={false}
      unreadErrors={0}
      onNavegar={onNavegar}
      variante="menu"
      {...props}
    />
  );
  return { onNavegar };
}

describe("ItemsDeCuenta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("variante menu", () => {
    it("usa role menuitem en los links y en Salir", () => {
      renderizar();

      expect(screen.getByRole("menuitem", { name: "Editar perfil" })).toHaveAttribute(
        "href",
        "/perfil"
      );
      expect(screen.getByRole("menuitem", { name: "Salir" })).toBeInTheDocument();
    });

    it("avisa la acción pendiente con '!' y sufijo accesible", () => {
      renderizar({ hasPendingSync: true });

      const item = screen.getByRole("menuitem", { name: /Editar perfil, acción pendiente/ });
      expect(item).toHaveTextContent("!");
      expect(item).not.toHaveTextContent("Pendiente");
    });
  });

  describe("variante drawer", () => {
    it("no usa roles de menú: links y botón planos", () => {
      renderizar({ variante: "drawer" });

      expect(screen.getByRole("link", { name: "Editar perfil" })).toHaveAttribute(
        "href",
        "/perfil"
      );
      expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    });

    it("avisa la acción pendiente con el texto 'Pendiente'", () => {
      renderizar({ variante: "drawer", hasPendingSync: true });

      const link = screen.getByRole("link", { name: /Editar perfil, acción pendiente/ });
      expect(link).toHaveTextContent("Pendiente");
    });
  });

  describe("avisos", () => {
    it("sin sincronización pendiente no muestra aviso ni sufijo accesible", () => {
      renderizar();

      expect(screen.getByRole("menuitem", { name: "Editar perfil" })).toBeInTheDocument();
      expect(screen.queryByText("!")).not.toBeInTheDocument();
    });

    it("los errores sin leer se muestran como badge accesible", () => {
      renderizar({ items: DOCENTE.itemsDeCuenta(), unreadErrors: 4 });

      expect(screen.getByRole("menuitem", { name: /Errores.*4 sin leer/ })).toHaveAttribute(
        "href",
        "/admin/errores"
      );
    });

    it("limita el badge a 99+", () => {
      renderizar({ items: DOCENTE.itemsDeCuenta(), unreadErrors: 120 });

      expect(screen.getByText("99+")).toBeInTheDocument();
    });

    it("sin errores sin leer no muestra badge", () => {
      renderizar({ items: DOCENTE.itemsDeCuenta(), unreadErrors: 0 });

      const item = screen.getByRole("menuitem", { name: "Errores" });
      expect(item).toBeInTheDocument();
      expect(item).not.toHaveTextContent("0");
    });

    it("el aviso de un rol no aparece en los ítems del otro", () => {
      renderizar({ items: DOCENTE.itemsDeCuenta(), hasPendingSync: true });

      const item = screen.getByRole("menuitem", { name: "Errores" });
      expect(item).toBeInTheDocument();
      expect(item).not.toHaveTextContent("!");
    });
  });

  describe("acciones", () => {
    it("navegar a un ítem avisa con onNavegar", async () => {
      const { onNavegar } = renderizar();

      await userEvent.setup().click(screen.getByRole("menuitem", { name: "Editar perfil" }));

      expect(onNavegar).toHaveBeenCalledTimes(1);
    });

    it("Salir llama a signOut con callbackUrl '/'", async () => {
      renderizar();

      await userEvent.setup().click(screen.getByRole("menuitem", { name: "Salir" }));

      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    });
  });
});
