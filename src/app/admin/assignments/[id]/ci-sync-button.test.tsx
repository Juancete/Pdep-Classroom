import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { CISyncButton } from "./ci-sync-button";

function mockResponse(ok: boolean, data: object = {}) {
  return { ok, json: async () => data };
}

const SIN_PARTICIPACION = { actualizadas: 0, omitidas: 0, fallidas: [] };

describe("CISyncButton", () => {
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
        participacion: SIN_PARTICIPACION,
      }) as Response
    );

    render(<CISyncButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(
      await screen.findByText(
        "No se pudo actualizar el CI de tp-x: La GitHub App no tiene permisos suficientes (403)"
      )
    ).toBeInTheDocument();
  });

  it("muestra la advertencia de participación fallida cuando sólo esa trae fallidas", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(true, {
        actualizadas: 0,
        omitidas: 0,
        fallidas: [],
        participacion: {
          actualizadas: 0,
          omitidas: 0,
          fallidas: [
            { repoName: "tp-x", error: "La GitHub App no tiene permisos suficientes (403)" },
          ],
        },
      }) as Response
    );

    render(<CISyncButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(
      await screen.findByText(
        "No se pudo actualizar la participación de tp-x: La GitHub App no tiene permisos suficientes (403)"
      )
    ).toBeInTheDocument();
  });

  it("no muestra nada en rojo sin fallidas y llama a refresh si hubo actualizadas de CI", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(true, {
        actualizadas: 1,
        omitidas: 0,
        fallidas: [],
        participacion: SIN_PARTICIPACION,
      }) as Response
    );

    render(<CISyncButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(screen.queryByText(/No se pudo actualizar/)).not.toBeInTheDocument();
  });

  it("llama a refresh si sólo hubo actualizadas de participación", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(true, {
        actualizadas: 0,
        omitidas: 1,
        fallidas: [],
        participacion: { actualizadas: 3, omitidas: 0, fallidas: [] },
      }) as Response
    );

    render(<CISyncButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("no llama a refresh si no hubo actualizadas de CI ni de participación, aunque no haya fallidas", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(true, {
        actualizadas: 0,
        omitidas: 1,
        fallidas: [],
        participacion: SIN_PARTICIPACION,
      }) as Response
    );

    render(<CISyncButton assignmentId="a1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
