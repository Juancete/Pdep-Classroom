import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRenombrarDocenteAction = vi.fn();
const mockCambiarEstadoDocenteAction = vi.fn();

import { NombreEditable, EstadoToggle } from "./docente-acciones";

describe("NombreEditable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el nombre actual y no el form de edición", () => {
    render(<NombreEditable id="a1" nombre="Ana García" action={mockRenombrarDocenteAction} />);
    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("muestra 'sin nombre' cuando no hay nombre cargado", () => {
    render(<NombreEditable id="a1" nombre={null} action={mockRenombrarDocenteAction} />);
    expect(screen.getByText("sin nombre")).toBeInTheDocument();
  });

  it("al hacer click en editar, muestra el input con el nombre actual", async () => {
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana García" action={mockRenombrarDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    expect(screen.getByDisplayValue("Ana García")).toBeInTheDocument();
  });

  it("cancelar cierra el form sin llamar a la action", async () => {
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana" action={mockRenombrarDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
    expect(mockRenombrarDocenteAction).not.toHaveBeenCalled();
  });

  it("guardar con éxito cierra el modo edición", async () => {
    mockRenombrarDocenteAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana" action={mockRenombrarDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mockRenombrarDocenteAction).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Editar nombre" })).toBeInTheDocument();
  });

  it("guardar con error se queda en modo edición mostrando el error", async () => {
    mockRenombrarDocenteAction.mockResolvedValue({
      ok: false,
      errors: { nombre: ["algo salió mal"] },
    });
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana" action={mockRenombrarDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("algo salió mal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("guardar rechazado conserva lo tipeado en vez de volver al nombre viejo", async () => {
    mockRenombrarDocenteAction.mockResolvedValue({
      ok: false,
      errors: { nombre: ["algo salió mal"] },
    });
    const user = userEvent.setup();
    render(<NombreEditable id="a1" nombre="Ana" action={mockRenombrarDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Editar nombre" }));
    const input = screen.getByDisplayValue("Ana");
    await user.clear(input);
    await user.type(input, "Nombre nuevo");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByText("algo salió mal");
    expect(screen.getByDisplayValue("Nombre nuevo")).toBeInTheDocument();
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
    render(<EstadoToggle id="a1" activo={true} action={mockCambiarEstadoDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    expect(confirm).toHaveBeenCalled();
    expect(mockCambiarEstadoDocenteAction).not.toHaveBeenCalled();
  });

  it("desactivar confirmado llama a la action con activo=false", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    mockCambiarEstadoDocenteAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={true} action={mockCambiarEstadoDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    expect(mockCambiarEstadoDocenteAction).toHaveBeenCalledWith("a1", false);
  });

  it("reactivar no pide confirmación", async () => {
    mockCambiarEstadoDocenteAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={false} action={mockCambiarEstadoDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(mockCambiarEstadoDocenteAction).toHaveBeenCalledWith("a1", true);
  });

  it("muestra el error si la action falla", async () => {
    mockCambiarEstadoDocenteAction.mockResolvedValue({ ok: false, error: "no se pudo" });
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={false} action={mockCambiarEstadoDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(await screen.findByText("no se pudo")).toBeInTheDocument();
  });

  it("si la action rechaza (falla de red), muestra el error y vuelve a habilitar el botón", async () => {
    mockCambiarEstadoDocenteAction.mockRejectedValue(new Error("Failed to fetch"));
    const user = userEvent.setup();
    render(<EstadoToggle id="a1" activo={false} action={mockCambiarEstadoDocenteAction} />);
    await user.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar" })).not.toBeDisabled();
  });
});
