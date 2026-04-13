import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { DeleteReposButton } from "./delete-repos-button";

function mockResponse(ok: boolean, data: object = {}) {
  return { ok, json: async () => data };
}

describe("DeleteReposButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no renderiza nada cuando activeRepoCount=0", () => {
    const { container } = render(
      <DeleteReposButton assignmentId="a1" activeRepoCount={0} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza el botón con el conteo correcto", () => {
    render(<DeleteReposButton assignmentId="a1" activeRepoCount={5} />);
    expect(
      screen.getByRole("button", { name: "Borrar todos los repos (5)" })
    ).toBeInTheDocument();
  });

  it("usa 'repo' en singular con 1 repo en el confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(false);

    render(<DeleteReposButton assignmentId="a1" activeRepoCount={1} />);
    await user.click(screen.getByRole("button"));

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("1 repo de GitHub")
    );
  });

  it("usa 'repos' en plural con más de 1 repo en el confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(false);

    render(<DeleteReposButton assignmentId="a1" activeRepoCount={3} />);
    await user.click(screen.getByRole("button"));

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("3 repos de GitHub")
    );
  });

  it("no llama a fetch si el usuario cancela", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(false);

    render(<DeleteReposButton assignmentId="a1" activeRepoCount={3} />);
    await user.click(screen.getByRole("button"));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("llama a fetch DELETE en el endpoint correcto", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(mockResponse(true) as Response);

    render(<DeleteReposButton assignmentId="xyz" activeRepoCount={2} />);
    await user.click(screen.getByRole("button"));

    expect(fetch).toHaveBeenCalledWith("/api/assignments/xyz/repos", {
      method: "DELETE",
    });
  });

  it("llama a router.refresh al completar", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(mockResponse(true) as Response);

    render(<DeleteReposButton assignmentId="a1" activeRepoCount={2} />);
    await user.click(screen.getByRole("button"));

    expect(mockRefresh).toHaveBeenCalled();
  });

  it("muestra error cuando el servidor falla", async () => {
    const user = userEvent.setup();
    vi.mocked(confirm).mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse(false, { error: "No se pudo eliminar" }) as Response
    );

    render(<DeleteReposButton assignmentId="a1" activeRepoCount={2} />);
    await user.click(screen.getByRole("button"));

    expect(await screen.findByText("No se pudo eliminar")).toBeInTheDocument();
  });
});
