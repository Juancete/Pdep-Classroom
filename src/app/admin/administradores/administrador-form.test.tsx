import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseActionState = vi.fn();
const mockCrearAdministradorAction = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: (...args: unknown[]) => mockUseActionState(...args) };
});

vi.mock("./actions", () => ({
  crearAdministradorAction: (...args: unknown[]) => mockCrearAdministradorAction(...args),
}));

import { AdministradorForm } from "./administrador-form";

const noop = vi.fn();

function noErrorState() {
  mockUseActionState.mockImplementation(
    (_action: unknown, initial: unknown) => [initial, noop]
  );
}

function errorState(errors: Record<string, string[]>) {
  mockUseActionState.mockReturnValue([{ ok: false, errors }, noop]);
}

function getInput(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

describe("AdministradorForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza los campos de usuario y nombre", () => {
    noErrorState();
    const { container } = render(<AdministradorForm />);
    expect(getInput(container, "githubUsername")).toBeTruthy();
    expect(getInput(container, "nombre")).toBeTruthy();
  });

  it("muestra el botón Agregar", () => {
    noErrorState();
    render(<AdministradorForm />);
    expect(screen.getByRole("button", { name: "Agregar" })).toBeInTheDocument();
  });

  it("muestra el error de campo cuando el estado trae errores", () => {
    errorState({ githubUsername: ["El usuario de GitHub no tiene un formato válido"] });
    render(<AdministradorForm />);
    expect(screen.getByText("El usuario de GitHub no tiene un formato válido")).toBeInTheDocument();
  });

  it("permite tipear en el campo de usuario", async () => {
    noErrorState();
    const user = userEvent.setup();
    const { container } = render(<AdministradorForm />);
    const input = getInput(container, "githubUsername");
    await user.type(input, "ayudante1");
    expect(input.value).toBe("ayudante1");
  });
});
