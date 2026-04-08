import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Assignment } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockUpdateAssignment = vi.fn();
const mockListarTemplates = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/store", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  updateAssignment: (...args: unknown[]) => mockUpdateAssignment(...args),
}));

vi.mock("@/lib/github", () => ({
  listarTemplates: () => mockListarTemplates(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import EditAssignmentPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides?: Partial<Assignment>): Assignment {
  return {
    id: "a1",
    titulo: "Kata Funcional",
    descripcion: "Primera kata",
    templateRepo: "kata-template",
    tipo: "individual",
    paradigma: "funcional",
    deadline: "2026-06-30",
    createdAt: new Date("2026-01-01").toISOString(),
    slug: "kata-funcional",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Edit Assignment page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockListarTemplates.mockResolvedValue([]);
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    await EditAssignmentPage({ params: { id: "a1" } });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/assignments si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(undefined);
    await EditAssignmentPage({ params: { id: "no-existe" } });
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("muestra el título 'Editar Assignment'", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    const element = await EditAssignmentPage({ params: { id: "a1" } });
    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain("Editar Assignment");
  });

  describe("campos pre-populados", () => {
    it("pre-popula el campo de título con el valor actual", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ titulo: "TP Lógico" }));
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("TP Lógico");
    });

    it("pre-popula el campo de slug con el valor actual", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ slug: "tp-logico" }));
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("tp-logico");
    });

    it("pre-popula la descripción con el valor actual", async () => {
      mockGetAssignment.mockResolvedValue(
        makeAssignment({ descripcion: "Descripción de prueba" })
      );
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("Descripción de prueba");
    });

    it("pre-popula el templateRepo con el valor actual", async () => {
      mockGetAssignment.mockResolvedValue(
        makeAssignment({ templateRepo: "mi-template-especial" })
      );
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("mi-template-especial");
    });

    it("pre-popula el deadline con el valor actual", async () => {
      mockGetAssignment.mockResolvedValue(
        makeAssignment({ deadline: "2026-12-31" })
      );
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("2026-12-31");
    });
  });

  describe("campos del formulario", () => {
    beforeEach(() => {
      mockGetAssignment.mockResolvedValue(makeAssignment());
    });

    it("muestra el campo de título", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('name="titulo"');
    });

    it("muestra el campo de slug", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('name="slug"');
    });

    it("muestra el campo de descripción", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('name="descripcion"');
    });

    it("muestra el campo de deadline", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('name="deadline"');
    });

    it("muestra las opciones de paradigma", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('name="paradigma"');
      expect(html).toContain("Funcional");
      expect(html).toContain("Logico");
      expect(html).toContain("Objetos");
    });

    it("muestra las opciones de tipo", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('name="tipo"');
      expect(html).toContain("Individual");
      expect(html).toContain("Grupal");
    });

    it("muestra el botón de guardar cambios", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("Guardar cambios");
    });

    it("muestra el link para cancelar apuntando al listado", async () => {
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("Cancelar");
      expect(html).toContain("/admin/assignments");
    });
  });

  describe("campo de template repo", () => {
    it("muestra un <select> cuando hay templates disponibles", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment());
      mockListarTemplates.mockResolvedValue([
        { name: "kata-template", fullName: "pdep-mn/kata-template", description: "" },
      ]);
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("Elegí un template");
    });

    it("muestra un <input> cuando no hay templates", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment());
      mockListarTemplates.mockResolvedValue([]);
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).not.toContain("Elegí un template");
    });

    it("muestra un <input> cuando falla la carga de templates", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment());
      mockListarTemplates.mockRejectedValue(new Error("Sin credenciales"));
      const element = await EditAssignmentPage({ params: { id: "a1" } });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).not.toContain("Elegí un template");
    });
  });
});
