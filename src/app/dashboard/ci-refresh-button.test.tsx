import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { CIRefreshButton } from "./ci-refresh-button";

function mockResponse(ok: boolean, data: object = {}) {
  return { ok, json: async () => data };
}

describe("CIRefreshButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra la advertencia de CI fallido cuando el resultado trae fallidas", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(true, {
        actualizadas: 0,
        omitidas: 0,
        fallidas: [
          { repoName: "tp-x", error: "La GitHub App no tiene permisos suficientes (403)" },
        ],
      }) as Response
    );

    render(<CIRefreshButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar estado de CI" }));

    expect(
      await screen.findByText(
        "No se pudo actualizar el CI de tp-x: La GitHub App no tiene permisos suficientes (403)"
      )
    ).toBeInTheDocument();
  });

  it("no muestra nada en rojo sin fallidas y llama a refresh cuando hay resultado", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(true, { actualizadas: 1, omitidas: 0, fallidas: [] }) as Response
    );

    render(<CIRefreshButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar estado de CI" }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.queryByText(/No se pudo actualizar/)).not.toBeInTheDocument();
  });
});
