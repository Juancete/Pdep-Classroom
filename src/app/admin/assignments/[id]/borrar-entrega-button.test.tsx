import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { BorrarEntregaButton } from "./borrar-entrega-button";

function mockResponse(ok: boolean, data: object = {}, status = ok ? 200 : 500) {
  return { ok, status, json: async () => data };
}

describe("BorrarEntregaButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderizar() {
    render(<BorrarEntregaButton assignmentId="a1" entregaId="e1" repoName="tp-repo" />);
  }

  it("no pide nada si se cancela el confirm", async () => {
    vi.mocked(confirm).mockReturnValue(false);
    renderizar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Borrar" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("menciona el repo en el confirm, borra y refresca", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(mockResponse(true, {}) as Response);
    renderizar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Borrar" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("tp-repo"));
    expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/entregas/e1", {
      method: "DELETE",
    });
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("muestra el error del servidor y no refresca", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "La entrega ya no existe" }, 404) as Response
    );
    renderizar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Borrar" }));

    expect(await screen.findByText("La entrega ya no existe")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
