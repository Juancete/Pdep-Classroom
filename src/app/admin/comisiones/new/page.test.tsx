import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("../actions", () => ({
  crearComision: vi.fn(),
}));

vi.mock("../comision-form", () => ({
  ComisionForm: ({
    submitLabel,
  }: {
    submitLabel: string;
  }) =>
    React.createElement("div", {
      "data-testid": "comision-form",
      "data-submit-label": submitLabel,
    }),
}));

import NewComisionPage from "./page";

// ── Tests ────────────────────────────────────────────────────

describe("New Comision page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("siempre llama a requireAdmin", async () => {
    await NewComisionPage();
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("muestra el título 'Nueva Comisión'", async () => {
    const element = await NewComisionPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Nueva Comisión");
  });

  it("renderiza el formulario con submitLabel 'Crear Comisión'", async () => {
    const element = await NewComisionPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-submit-label="Crear Comisión"');
  });

  it("propaga el error si requireAdmin falla", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("No autorizado"));
    await expect(NewComisionPage()).rejects.toThrow("No autorizado");
  });
});
