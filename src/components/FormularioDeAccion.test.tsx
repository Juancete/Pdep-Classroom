import { render, screen } from "@testing-library/react";

const mockUseActionState = vi.fn();
const mockUseFormStatus = vi.fn();

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (...args: unknown[]) => mockUseActionState(...args),
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => mockUseFormStatus(),
  };
});

import { FormularioDeAccion, type EstadoDeAccion } from "./FormularioDeAccion";

type Estado = EstadoDeAccion<{ cantidad: number }>;

const actionStub = vi.fn();

function renderizar() {
  return render(
    <FormularioDeAccion<Estado>
      action={actionStub}
      campos={{ comisionId: "c1", otro: "x" }}
      etiqueta="Hacer"
      etiquetaPendiente="Haciendo…"
      resultado={(estado) => <span>{estado.cantidad} hechos</span>}
    />
  );
}

describe("FormularioDeAccion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActionState.mockReturnValue([{ status: "idle" }, vi.fn()]);
    mockUseFormStatus.mockReturnValue({ pending: false });
  });

  it("idle: muestra el botón y los campos ocultos, sin resultado ni error", () => {
    const { container } = renderizar();

    expect(screen.getByRole("button", { name: "Hacer" })).toBeEnabled();
    expect(container.querySelector<HTMLInputElement>('[name="comisionId"]')?.value).toBe("c1");
    expect(container.querySelector<HTMLInputElement>('[name="otro"]')?.value).toBe("x");
    expect(screen.queryByText(/hechos/)).not.toBeInTheDocument();
    expect(container.querySelector(".text-red-600")).toBeNull();
  });

  it("arranca la action con el estado idle", () => {
    renderizar();

    expect(mockUseActionState).toHaveBeenCalledWith(actionStub, { status: "idle" });
  });

  it("pending: deshabilita el botón y muestra la etiqueta pendiente", () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    renderizar();

    const boton = screen.getByRole("button", { name: "Haciendo…" });
    expect(boton).toBeDisabled();
  });

  it("ok: renderiza el resultado del consumidor", () => {
    mockUseActionState.mockReturnValue([{ status: "ok", cantidad: 3 }, vi.fn()]);
    renderizar();

    expect(screen.getByText("3 hechos")).toBeInTheDocument();
  });

  it("error: muestra el mensaje en rojo", () => {
    mockUseActionState.mockReturnValue([{ status: "error", message: "Algo falló" }, vi.fn()]);
    renderizar();

    expect(screen.getByText("Algo falló")).toHaveClass("text-red-600");
  });
});
