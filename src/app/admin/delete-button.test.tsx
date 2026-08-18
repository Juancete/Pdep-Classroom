import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { DeleteButton } from "./delete-button";

function mockResponse(ok: boolean, data: object = {}, status = ok ? 200 : 500) {
  return { ok, status, json: async () => data };
}

describe("DeleteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renderiza el botón 'Eliminar'", () => {
    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/test/1" />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("no llama a fetch si el usuario cancela la confirmación", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(false);

    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/test/1" />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de confirmación correcto", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(false);

    render(
      <DeleteButton confirmMessage="¿Eliminar este recurso?" endpoint="/api/test/1" />
    );
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(confirm).toHaveBeenCalledWith("¿Eliminar este recurso?");
  });

  it("llama a fetch DELETE en el endpoint correcto al confirmar", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(mockResponse(true) as Response);

    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/items/42" />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(fetch).toHaveBeenCalledWith("/api/items/42", { method: "DELETE" });
  });

  it("llama a router.refresh después de eliminar con éxito", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(mockResponse(true) as Response);

    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/test/1" />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(mockRefresh).toHaveBeenCalled();
  });

  it("muestra el error del servidor cuando falla", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "No autorizado" }, 403) as Response
    );

    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/test/1" />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("No autorizado")).toBeInTheDocument();
  });

  it("muestra error genérico si el servidor no devuelve mensaje", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, {}, 500) as Response
    );

    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/test/1" />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("Error 500")).toBeInTheDocument();
  });

  it("compact renderiza el botón sin texto pero con nombre accesible 'Eliminar'", () => {
    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/test/1" compact />);
    const button = screen.getByRole("button", { name: "Eliminar" });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveTextContent("Eliminar");
  });

  it("compact funciona igual al confirmar (fetch + refresh)", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(mockResponse(true) as Response);

    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/items/9" compact />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(fetch).toHaveBeenCalledWith("/api/items/9", { method: "DELETE" });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("no llama a router.refresh cuando falla", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "fallo" }) as Response
    );

    render(<DeleteButton confirmMessage="¿Seguro?" endpoint="/api/test/1" />);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await screen.findByText("fallo");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
