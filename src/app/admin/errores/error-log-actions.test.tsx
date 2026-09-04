import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_LOGS_CHANGED_EVENT } from "@/components/layout/use-error-log-count";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { AcknowledgeErrorButton, ErrorLogBulkActions } from "./error-log-actions";

function successfulResponse(data: Record<string, unknown>) {
  return { ok: true, json: async () => data };
}

describe("acciones de ErrorLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reconoce un error, refresca la página y notifica al badge", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse({ acknowledged: true }));
    vi.stubGlobal("fetch", fetchMock);
    const changed = vi.fn();
    window.addEventListener(ERROR_LOGS_CHANGED_EVENT, changed, { once: true });
    render(<AcknowledgeErrorButton id="e1" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Marcar como leído" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/errores/e1",
      { method: "PATCH" }
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("Error marcado como leído");
    expect(changed).toHaveBeenCalledOnce();
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("reconoce todos los pendientes e informa la cantidad", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse({ acknowledged: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ErrorLogBulkActions unread={3} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Marcar todos como leídos" }));

    expect(await screen.findByRole("status")).toHaveTextContent("3 errores marcados como leídos");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/errores/acknowledge-all",
      { method: "POST" }
    );
  });

  it("confirma la purga e informa cuando no había registros vencidos", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse({ deleted: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ErrorLogBulkActions unread={0} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Purgar antiguos" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "No había errores antiguos para purgar"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/errores/purge",
      { method: "POST" }
    );
  });

  it("muestra el error de la API sin refrescar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "DB caída" }),
    }));
    render(<AcknowledgeErrorButton id="e1" />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Marcar como leído" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("DB caída");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
