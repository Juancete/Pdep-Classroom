import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcceptButton } from "./accept-button";

function mockResponse(ok: boolean, data: object = {}) {
  return { ok, json: async () => data };
}

describe("AcceptButton", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("location", { reload: vi.fn(), href: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renderiza el botón 'Aceptar' inicialmente", () => {
    render(<AcceptButton assignmentId="a1" />);
    expect(screen.getByRole("button", { name: "Aceptar" })).toBeInTheDocument();
  });

  it("el botón no está deshabilitado inicialmente", () => {
    render(<AcceptButton assignmentId="a1" />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("llama a fetch con el endpoint y método correctos", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(mockResponse(true) as Response);

    render(<AcceptButton assignmentId="xyz" />);
    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(fetch).toHaveBeenCalledWith("/api/assignments/xyz/accept", {
      method: "POST",
    });
  });

  it("llama a window.location.reload al completar exitosamente", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(mockResponse(true) as Response);

    render(<AcceptButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(window.location.reload).toHaveBeenCalled();
  });

  it("muestra el mensaje de error del servidor cuando falla", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "Ya tiene repo" }) as Response
    );

    render(<AcceptButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(await screen.findByText("Ya tiene repo")).toBeInTheDocument();
  });

  it("muestra mensaje genérico si el servidor no devuelve error", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(mockResponse(false, {}) as Response);

    render(<AcceptButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(await screen.findByText("Error al crear el repo")).toBeInTheDocument();
  });

  it("no llama reload cuando falla", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "error" }) as Response
    );

    render(<AcceptButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    await screen.findByText("error");
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
