import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockListarTemplates = vi.fn();
const mockCreateAssignment = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/github", () => ({
  listarTemplates: () => mockListarTemplates(),
}));

vi.mock("@/lib/store", () => ({
  createAssignment: (...args: unknown[]) => mockCreateAssignment(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
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

  describe("campo de template repo", () => {
    it("muestra un <select> cuando hay templates disponibles", async () => {
      mockListarTemplates.mockResolvedValue([
        { name: "kata-template", fullName: "pdep-mn/kata-template", description: "Kata de funcional" },
        { name: "tp-objetos", fullName: "pdep-mn/tp-objetos", description: "" },
      ]);

      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("<select");
      expect(html).toContain('name="templateRepo"');
    });

    it("muestra las opciones de templates en el select", async () => {
      mockListarTemplates.mockResolvedValue([
        { name: "kata-template", fullName: "pdep-mn/kata-template", description: "Kata de funcional" },
        { name: "tp-logico", fullName: "pdep-mn/tp-logico", description: "" },
      ]);

      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("kata-template");
      expect(html).toContain("tp-logico");
    });

    it("muestra la descripción del template junto al nombre", async () => {
      mockListarTemplates.mockResolvedValue([
        { name: "kata-template", fullName: "pdep-mn/kata-template", description: "Kata de funcional" },
      ]);

      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Kata de funcional");
    });

    it("muestra un <input> de texto cuando no hay templates", async () => {
      mockListarTemplates.mockResolvedValue([]);

      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      // Sin select de templateRepo (sólo hay selects de paradigma y tipo)
      const templateSelectCount = (html.match(/name="templateRepo"/g) || []).length;
      expect(templateSelectCount).toBe(1);
      // Debe ser un input, no un select con opciones de templates
      expect(html).toContain('name="templateRepo"');
      expect(html).not.toContain("Elegí un template");
    });

    it("muestra un <input> cuando falla la carga de templates", async () => {
      mockListarTemplates.mockRejectedValue(new Error("Sin credenciales"));

      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("Elegí un template");
    });
  });

  describe("opciones de paradigma", () => {
    beforeEach(() => {
      mockListarTemplates.mockResolvedValue([]);
    });

    it("muestra las tres opciones de paradigma", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Funcional");
      expect(html).toContain("Logico");
      expect(html).toContain("Objetos");
    });

    it("muestra el select de paradigma", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('name="paradigma"');
    });
  });

  describe("opciones de tipo", () => {
    beforeEach(() => {
      mockListarTemplates.mockResolvedValue([]);
    });

    it("muestra las opciones individual y grupal", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Individual");
      expect(html).toContain("Grupal");
    });

    it("muestra el select de tipo", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('name="tipo"');
    });
  });

  describe("campos del formulario", () => {
    beforeEach(() => {
      mockListarTemplates.mockResolvedValue([]);
    });

    it("muestra el campo de título", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('name="titulo"');
    });

    it("muestra el campo de slug", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('name="slug"');
    });

    it("muestra el campo de descripción", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('name="descripcion"');
    });

    it("muestra el campo de deadline", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('name="deadline"');
    });

    it("muestra el botón para crear", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Crear Assignment");
    });

    it("muestra el link para cancelar", async () => {
      const element = await NewAssignmentPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Cancelar");
      expect(html).toContain("/admin/assignments");
    });
  });
});
