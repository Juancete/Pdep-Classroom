import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Comision, IndividualAssignment } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockGetAssignment = vi.fn();
const mockListarTemplates = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
}));

vi.mock("@/lib/github", () => ({
  listarTemplates: () => mockListarTemplates(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mockRedirect(path);
    throw new Error("redirect");
  },
}));

vi.mock("../../actions", () => ({
  actualizarAssignment: vi.fn(),
}));

vi.mock("../../assignment-form", () => ({
  AssignmentForm: ({
    templates,
    submitLabel,
    defaultValues,
  }: {
    templates: { name: string }[];
    submitLabel: string;
    defaultValues?: Record<string, string>;
  }) =>
    React.createElement("div", {
      "data-testid": "assignment-form",
      "data-submit-label": submitLabel,
      "data-template-count": templates.length,
      "data-default-titulo": defaultValues?.titulo,
      "data-default-slug": defaultValues?.slug,
      "data-default-template-repo": defaultValues?.templateRepo,
      "data-default-paradigma": defaultValues?.paradigma,
      "data-default-tipo": defaultValues?.tipo,
      "data-default-deadline": defaultValues?.deadline,
    }),
}));

import EditAssignmentPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeAssignment(overrides?: object) {
  const comision = new Comision(2026, "sheet-1");
  comision.activa = true;
  return Object.assign(new IndividualAssignment(), {
    id: "a1",
    titulo: "Kata Funcional",
    descripcion: "Primera kata",
    templateRepo: "kata-template",
    tipo: "individual",
    paradigma: "funcional",
    deadline: new Date("2026-06-30"),
    createdAt: new Date("2026-01-01"),
    slug: "kata-funcional",
    comision,
    ...overrides,
  });
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
    await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("redirige a /admin/assignments si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(undefined);
    await expect(EditAssignmentPage({ params: Promise.resolve({ id: "no-existe" }) })).rejects.toThrow("redirect");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("muestra el título 'Editar Assignment'", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain("Editar Assignment");
  });

  it("renderiza el formulario con submitLabel 'Guardar cambios'", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment());
    const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element as React.ReactElement);
    expect(html).toContain("data-submit-label=\"Guardar cambios\"");
  });

  it("muestra la comisión asociada sin agregarla al formulario", async () => {
    const comision = new Comision(2027, "sheet-2");
    comision.activa = true;
    mockGetAssignment.mockResolvedValue(makeAssignment({ comision }));

    const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Comisión:");
    expect(html).toContain("2027 (Activa)");
    expect(html).not.toContain("name=\"comisionId\"");
  });

  it("muestra Histórica cuando la comisión asociada no está activa", async () => {
    const comision = new Comision(2027, "sheet-2");
    comision.activa = false;
    mockGetAssignment.mockResolvedValue(makeAssignment({ comision }));

    const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("2027 (Histórica)");
  });

  it("muestra Sin comisión para assignments huérfanos", async () => {
    mockGetAssignment.mockResolvedValue(makeAssignment({ comision: undefined }));

    const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
    const html = renderToStaticMarkup(element as React.ReactElement);

    expect(html).toContain("Sin comisión");
  });

  describe("defaultValues pre-populados", () => {
    it("pasa el título del assignment como defaultValue", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ titulo: "TP Lógico" }));
      const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("TP Lógico");
    });

    it("pasa el slug del assignment como defaultValue", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ slug: "tp-logico" }));
      const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("tp-logico");
    });

    it("pasa el templateRepo del assignment como defaultValue", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ templateRepo: "mi-template" }));
      const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("mi-template");
    });

    it("pasa el deadline del assignment como defaultValue", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment({ deadline: new Date("2026-12-31") }));
      const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain("2026-12-31");
    });
  });

  describe("templates", () => {
    it("pasa los templates disponibles al formulario", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment());
      mockListarTemplates.mockResolvedValue([
        { name: "kata-template", fullName: "pdep-mn-utn/kata-template", description: "" },
      ]);
      const element = await EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) });
      const html = renderToStaticMarkup(element as React.ReactElement);
      expect(html).toContain('data-template-count="1"');
    });

    it("propaga el error cuando falla la carga de templates", async () => {
      mockGetAssignment.mockResolvedValue(makeAssignment());
      mockListarTemplates.mockRejectedValue(new Error("Sin credenciales"));
      await expect(EditAssignmentPage({ params: Promise.resolve({ id: "a1" }) })).rejects.toThrow("Sin credenciales");
    });
  });
});
