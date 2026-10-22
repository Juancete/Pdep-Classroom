import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { CIRerunButton } from "./ci-rerun-button";

function mockResponse(ok: boolean, data: object = {}, status = ok ? 200 : 500) {
  return { ok, status, json: async () => data };
}

describe("CIRerunButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderizar(permiteReejecucion = true) {
    render(
      <CIRerunButton assignmentId="a1" entregaId="e1" permiteReejecucion={permiteReejecucion} />
    );
  }

  it("no pide nada si se cancela el confirm", async () => {
    vi.mocked(confirm).mockReturnValue(false);
    renderizar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Reejecutar CI" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("pide la reejecución y refresca al terminar bien", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(mockResponse(true, {}) as Response);
    renderizar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Reejecutar CI" }));

    expect(fetch).toHaveBeenCalledWith("/api/assignments/a1/ci/rerun", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entregaId: "e1" }),
    });
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("muestra el error del servidor y no refresca", async () => {
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "No hay checks previos" }, 409) as Response
    );
    renderizar();

    await userEvent.setup().click(screen.getByRole("button", { name: "Reejecutar CI" }));

    expect(await screen.findByText("No hay checks previos")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("deshabilita el botón si no permite la reejecución", () => {
    renderizar(false);

    expect(screen.getByRole("button", { name: "Reejecutar CI" })).toBeDisabled();
  });
});
