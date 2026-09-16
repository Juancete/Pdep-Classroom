import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRenombrarAdministradorAction = vi.fn();
const mockCambiarEstadoAdministradorAction = vi.fn();

vi.mock("./actions", () => ({
  renombrarAdministradorAction: (...args: unknown[]) => mockRenombrarAdministradorAction(...args),
  cambiarEstadoAdministradorAction: (...args: unknown[]) => mockCambiarEstadoAdministradorAction(...args),
}));

import { NombreEditable, EstadoToggle } from "./administrador-acciones";

describe("NombreEditable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el nombre actual y no el form de edición", () => {
    render(<NombreEditable id="a1" nombre="Ana García" />);
    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("muestra 'sin nombre' cuando no hay nombre cargado", () => {
    render(<NombreEditable id="a1" nombre={null} />);
    expect(screen.getByText("sin nombre")).toBeInTheDocument();
  });

  it("al hacer click en editar, muestra el input con el nombre actual", async () => {
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana García" />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    expect(screen.getByDisplayValue("Ana García")).toBeInTheDocument();
  });

  it("cancelar cierra el form sin llamar a la action", async () => {
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana" />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(mockRenombrarAdministradorAction).not.toHaveBeenCalled();
  });

  it("guardar con éxito cierra el modo edición", async () => {
    mockRenombrarAdministradorAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana" />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mockRenombrarAdministradorAction).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Editar nombre" })).toBeInTheDocument();
  });

  it("guardar con error se queda en modo edición mostrando el error", async () => {
    mockRenombrarAdministradorAction.mockResolvedValue({
      ok: false,
      errors: { nombre: ["algo salió mal"] },
    });
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana" />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("algo salió mal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });
});

describe("EstadoToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("desactivar pide confirmación antes de llamar a la action", async () => {
    vi.mocked(confirm).mockReturnValue(false);
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={true} />);
    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    expect(confirm).toHaveBeenCalled();
    expect(mockCambiarEstadoAdministradorAction).not.toHaveBeenCalled();
  });

  it("desactivar confirmado llama a la action con activo=false", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    mockCambiarEstadoAdministradorAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={true} />);
    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    expect(mockCambiarEstadoAdministradorAction).toHaveBeenCalledWith("a1", false);
  });

  it("reactivar no pide confirmación", async () => {
    mockCambiarEstadoAdministradorAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={false} />);
    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(mockCambiarEstadoAdministradorAction).toHaveBeenCalledWith("a1", true);
  });

  it("muestra el error si la action falla", async () => {
    mockCambiarEstadoAdministradorAction.mockResolvedValue({ ok: false, error: "no se pudo" });
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={false} />);
    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(await screen.findByText("no se pudo")).toBeInTheDocument();
  });
});
