import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockListarTemplates = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/github", () => ({
  listarTemplates: () => mockListarTemplates(),
}));

vi.mock("../actions", () => ({
  crearAssignment: vi.fn(),
}));

vi.mock("../assignment-form", () => ({
  AssignmentForm: ({
    templates,
    submitLabel,
  }: {
    templates: { name: string }[];
    submitLabel: string;
  }) =>
    React.createElement("div", {
      "data-testid": "assignment-form",
      "data-submit-label": submitLabel,
      "data-template-count": templates.length,
      "data-template-names": templates.map((t) => t.name).join(","),
    }),
}));

import NewAssignmentPage from "./page";

// ── Tests ────────────────────────────────────────────────────

describe("New Assignment page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("siempre llama a requireAdmin", async () => {
    mockListarTemplates.mockResolvedValue([]);
    await NewAssignmentPage();
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("muestra el título 'Nuevo Assignment'", async () => {
    mockListarTemplates.mockResolvedValue([]);
    const element = await NewAssignmentPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Nuevo Assignment");
  });

  it("renderiza el formulario con submitLabel 'Crear Assignment'", async () => {
    mockListarTemplates.mockResolvedValue([]);
    const element = await NewAssignmentPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("data-submit-label=\"Crear Assignment\"");
  });

  describe("templates", () => {
    it("pasa los templates disponibles al formulario", async () => {
      mockListarTemplates.mockResolvedValue([
        { name: "kata-template", fullName: "pdep-mn-utn/kata-template", description: "" },
        { name: "tp-logico", fullName: "pdep-mn-utn/tp-logico", description: "" },
      ]);
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("kata-template");
      expect(html).toContain("tp-logico");
      expect(html).toContain('data-template-count="2"');
    });

    it("pasa lista vacía cuando no hay templates", async () => {
      mockListarTemplates.mockResolvedValue([]);
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-template-count="0"');
    });

    it("pasa lista vacía cuando falla la carga de templates", async () => {
      mockListarTemplates.mockRejectedValue(new Error("Sin credenciales"));
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-template-count="0"');
    });
  });
});
