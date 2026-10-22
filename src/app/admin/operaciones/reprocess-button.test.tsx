import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { ReprocessWebhookButton } from "./reprocess-button";

function mockResponse(ok: boolean, data: object = {}, status = ok ? 200 : 500) {
  return { ok, status, json: async () => data };
}

describe("ReprocessWebhookButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reprocesa un delivery puntual y refresca", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(true, {}) as Response);
    render(<ReprocessWebhookButton deliveryId="d1" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Reprocesar" }));

    expect(fetch).toHaveBeenCalledWith("/api/webhooks/github/reprocesar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId: "d1" }),
    });
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("sin deliveryId reprocesa los pendientes con cuerpo vacío", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse(true, {}) as Response);
    render(<ReprocessWebhookButton />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Reprocesar pendientes" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/webhooks/github/reprocesar",
      expect.objectContaining({ body: "{}" })
    );
  });

  it("muestra el error del servidor y no refresca", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "Delivery inexistente" }, 404) as Response
    );
    render(<ReprocessWebhookButton deliveryId="d1" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Reprocesar" }));

    expect(await screen.findByText("Delivery inexistente")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
