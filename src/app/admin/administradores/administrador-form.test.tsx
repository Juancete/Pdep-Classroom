import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrearAdministradorAction = vi.fn();

import { AdministradorForm } from "./administrador-form";

function getInput(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

describe("AdministradorForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza los campos de usuario y nombre y el botón Agregar", () => {
    mockCrearAdministradorAction.mockResolvedValue(null);
    const { container } = render(<AdministradorForm action={mockCrearAdministradorAction} />);
    expect(getInput(container, "githubUsername")).toBeTruthy();
    expect(getInput(container, "nombre")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeInTheDocument();
  });

  it("alta rechazada: conserva lo tipeado y muestra el error de campo", async () => {
    mockCrearAdministradorAction.mockResolvedValue({
      ok: false,
      errors: { githubUsername: ["El usuario de GitHub no tiene un formato válido"] },
      valores: { githubUsername: "ayudante1", nombre: "Ana" },
    });
    const user = userEvent.setup();
    const { container } = render(<AdministradorForm action={mockCrearAdministradorAction} />);

    await user.type(getInput(container, "githubUsername"), "ayudante1");
    await user.type(getInput(container, "nombre"), "Ana");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    await screen.findByText("El usuario de GitHub no tiene un formato válido");

    expect(getInput(container, "githubUsername").value).toBe("ayudante1");
    expect(getInput(container, "nombre").value).toBe("Ana");

    const formDataEnviado = mockCrearAdministradorAction.mock.calls[0][1] as FormData;
    expect(formDataEnviado.get("githubUsername")).toBe("ayudante1");
  });

  it("alta exitosa: el form queda vacío tras el reset automático de React", async () => {
    mockCrearAdministradorAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { container } = render(<AdministradorForm action={mockCrearAdministradorAction} />);

    await user.type(getInput(container, "githubUsername"), "ayudante1");
    await user.type(getInput(container, "nombre"), "Ana");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => {
      expect(getInput(container, "githubUsername").value).toBe("");
    });
    expect(getInput(container, "nombre").value).toBe("");
  });
});
