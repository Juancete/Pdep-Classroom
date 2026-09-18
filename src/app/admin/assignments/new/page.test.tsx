import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { Comision, resolverContextoDeComision } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockListarTemplates = vi.fn();
const mockObtenerContextoDeComision = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`redirect:${url}`);
});

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/github", () => ({
  listarTemplates: () => mockListarTemplates(),
}));

vi.mock("@/application/comisionConsultada", () => ({
  obtenerContextoDeComision: () => mockObtenerContextoDeComision(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
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

// ── Helpers ──────────────────────────────────────────────────
// Contextos armados con la factory real (no se mockea `ContextoDeComision`):
// la página sólo le pregunta al contexto, igual que en producción.

function comisionCon(id: string, anio: number, activa: boolean): Comision {
  const comision = new Comision(anio, "sheet-test");
  comision.id = id;
  comision.activa = activa;
  return comision;
}

function contextoConComisionActiva(anio = 2026) {
  const comision = comisionCon("c-activa", anio, true);
  return { contexto: resolverContextoDeComision([comision]), comisiones: [comision] };
}

function contextoConComisionHistorica() {
  const comisionActiva = comisionCon("c-activa", 2026, true);
  const comisionHistorica = comisionCon("c-historica", 2025, false);
  return {
    contexto: resolverContextoDeComision(
      [comisionActiva, comisionHistorica],
      "c-historica"
    ),
    comisiones: [comisionActiva, comisionHistorica],
  };
}

function contextoSinComision() {
  return { contexto: resolverContextoDeComision([]), comisiones: [] };
}

// ── Tests ────────────────────────────────────────────────────

describe("New Assignment page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockObtenerContextoDeComision.mockResolvedValue(contextoConComisionActiva());
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

  it("muestra el subtítulo con el año de la comisión activa", async () => {
    mockObtenerContextoDeComision.mockResolvedValue(contextoConComisionActiva(2027));
    mockListarTemplates.mockResolvedValue([]);
    const element = await NewAssignmentPage();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Se creará en la comisión 2027 (activa)");
  });

  it("redirige a /admin/assignments cuando la comisión consultada es histórica", async () => {
    mockObtenerContextoDeComision.mockResolvedValue(contextoConComisionHistorica());

    await expect(NewAssignmentPage()).rejects.toThrow("redirect:/admin/assignments");

    expect(mockListarTemplates).not.toHaveBeenCalled();
  });

  it("redirige a /admin/assignments cuando no hay comisión consultada", async () => {
    mockObtenerContextoDeComision.mockResolvedValue(contextoSinComision());

    await expect(NewAssignmentPage()).rejects.toThrow("redirect:/admin/assignments");

    expect(mockListarTemplates).not.toHaveBeenCalled();
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

    it("propaga el error cuando falla la carga de templates", async () => {
      mockListarTemplates.mockRejectedValue(new Error("Sin credenciales"));
      await expect(NewAssignmentPage()).rejects.toThrow("Sin credenciales");
    });
  });
});
