import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Assignment } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignments = vi.fn();
const mockGetEntregaCountsByAssignment = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignments: () => mockGetAssignments(),
  getEntregaCountsByAssignment: () => mockGetEntregaCountsByAssignment(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("./delete-button", () => ({
  DeleteAssignmentButton: ({ id, titulo }: { id: string; titulo: string }) => (
    <button data-id={id}>Eliminar {titulo}</button>
  ),
}));

import AdminAssignmentsPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides?: Partial<Assignment>): Assignment {
  return {
    id: "a1",
    titulo: "Kata Funcional",
    descripcion: "Descripción de la kata",
    templateRepo: "kata-template",
    tipo: "individual",
    paradigma: "funcional",
    deadline: "",
    createdAt: new Date("2026-01-01").toISOString(),
    slug: "kata-funcional",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Admin Assignments page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetEntregaCountsByAssignment.mockResolvedValue(new Map());
  });

  it("siempre llama a requireAdmin", async () => {
    mockGetAssignments.mockResolvedValue([]);
    await AdminAssignmentsPage();
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("muestra el link para crear un nuevo assignment", async () => {
    mockGetAssignments.mockResolvedValue([]);
    const element = await AdminAssignmentsPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("href=\"/admin/assignments/new\"");
    expect(html).toContain("Nuevo Assignment");
  });

  describe("estado vacío", () => {
    it("muestra mensaje cuando no hay assignments", async () => {
      mockGetAssignments.mockResolvedValue([]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("No hay assignments todavía");
    });

    it("no muestra la tabla cuando no hay assignments", async () => {
      mockGetAssignments.mockResolvedValue([]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain("<table");
    });
  });

  describe("con assignments", () => {
    it("muestra la tabla cuando hay assignments", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment()]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("<table");
    });

    it("muestra el título del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ titulo: "TP Lógico" }),
      ]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("TP Lógico");
    });

    it("muestra el paradigma del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ paradigma: "objetos" }),
      ]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("objetos");
    });

    it("muestra el tipo del assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ tipo: "grupal" }),
      ]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("grupal");
    });

    it("muestra el templateRepo", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ templateRepo: "mi-template-especial" }),
      ]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("mi-template-especial");
    });

    it("muestra las cabeceras de la tabla", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment()]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Título");
      expect(html).toContain("Paradigma");
      expect(html).toContain("Tipo");
      expect(html).toContain("Template");
      expect(html).toContain("Entregas");
      expect(html).toContain("Deadline");
      expect(html).toContain("Acciones");
    });

    it("muestra el link de editar por cada assignment", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "a1" })]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('href="/admin/assignments/a1/edit"');
      expect(html).toContain("Editar");
    });

    it("muestra el botón de eliminar por cada assignment", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ id: "tp-1", titulo: "Kata Funcional" }),
      ]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Eliminar Kata Funcional");
    });
  });

  describe("conteo de entregas", () => {
    it("muestra 0 entregas cuando no hay ninguna", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "tp-1" })]);
      mockGetEntregaCountsByAssignment.mockResolvedValue(new Map());

      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain(">0<");
    });

    it("muestra la cantidad correcta de entregas", async () => {
      mockGetAssignments.mockResolvedValue([makeAssignment({ id: "tp-1" })]);
      mockGetEntregaCountsByAssignment.mockResolvedValue(new Map([["tp-1", 3]]));

      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain(">3<");
    });
  });

  describe("formato de deadline", () => {
    it("muestra el deadline formateado cuando está presente", async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ deadline: "2026-06-30" }),
      ]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      // Localización es-AR: "30/6/2026" o similar
      expect(html).toContain("2026");
      expect(html).not.toContain(">—<");
    });

    it('muestra "—" cuando no hay deadline', async () => {
      mockGetAssignments.mockResolvedValue([
        makeAssignment({ deadline: "" }),
      ]);
      const element = await AdminAssignmentsPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("—");
    });
  });
});
