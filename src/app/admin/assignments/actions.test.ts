import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Comision } from "@/domain/entities";
import { AssignmentNoEncontradoError, AssignmentNoGrupalError } from "@/domain/entities";
import { PlanillaNoDisponibleError } from "@/infrastructure/PlanillaNoDisponibleError";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockCreateAssignment = vi.fn();
const mockUpdateAssignment = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockGetAssignment = vi.fn();
const mockVolcarGruposAPlanilla = vi.fn();
const mockRedirect = vi.fn();

const {
  FakeComisionActivaRequeridaError,
  FakeColumnaDeGrupoNoConfiguradaError,
  FakeAssignmentSinComisionError,
  FakeColumnaDeGrupoOcupadaPorDatosPersonalesError,
} = vi.hoisted(() => ({
  FakeComisionActivaRequeridaError: class FakeComisionActivaRequeridaError extends Error {},
  FakeColumnaDeGrupoNoConfiguradaError: class FakeColumnaDeGrupoNoConfiguradaError extends Error {},
  FakeAssignmentSinComisionError: class FakeAssignmentSinComisionError extends Error {},
  FakeColumnaDeGrupoOcupadaPorDatosPersonalesError: class FakeColumnaDeGrupoOcupadaPorDatosPersonalesError extends Error {},
}));

vi.mock("@/infrastructure/auth/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  ComisionActivaRequeridaError: FakeComisionActivaRequeridaError,
  createAssignment: (...args: unknown[]) => mockCreateAssignment(...args),
  updateAssignment: (...args: unknown[]) => mockUpdateAssignment(...args),
  getComisionActiva: (...args: unknown[]) => mockGetComisionActiva(...args),
  getAssignment: (...args: unknown[]) => mockGetAssignment(...args),
}));

vi.mock("@/application/volcarGruposAPlanilla", () => ({
  volcarGruposAPlanilla: (...args: unknown[]) => mockVolcarGruposAPlanilla(...args),
  ColumnaDeGrupoNoConfiguradaError: FakeColumnaDeGrupoNoConfiguradaError,
  AssignmentSinComisionError: FakeAssignmentSinComisionError,
  ColumnaDeGrupoOcupadaPorDatosPersonalesError: FakeColumnaDeGrupoOcupadaPorDatosPersonalesError,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { crearAssignment, actualizarAssignment, volcarGruposALaPlanilla } from "./actions";

// ── Helpers ──────────────────────────────────────────────────

function makeFormData(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.append(key, value);
  }
  return fd;
}

// Duck-typed a propósito (mismo criterio que `fakeGrupo`/`fakeAlumno` en
// `Assignment.test.ts`): la action sólo usa `columnaOcupadaPorDatosPersonales`.
function fakeComision(columnasOcupadas: number[] = []): Comision {
  return {
    columnaOcupadaPorDatosPersonales: (indice: number) => columnasOcupadas.includes(indice),
  } as unknown as Comision;
}

const BASE_INDIVIDUAL = {
  titulo: "Kata Funcional",
  templateRepo: "kata-template",
  tipo: "individual",
  paradigma: "funcional",
};

const BASE_GRUPAL = {
  titulo: "TP Objetos",
  templateRepo: "tp-objetos-template",
  tipo: "grupal",
  paradigma: "objetos",
  maxIntegrantes: "3",
};

// ── crearAssignment ──────────────────────────────────────────

describe("crearAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockCreateAssignment.mockResolvedValue({ id: "new-id" });
    mockGetComisionActiva.mockResolvedValue(fakeComision());
  });

  it("siempre llama a requireAdmin", async () => {
    await crearAssignment(null, makeFormData(BASE_INDIVIDUAL));
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  describe("assignment individual", () => {
    it("crea el assignment y redirige a /admin/assignments", async () => {
      await crearAssignment(null, makeFormData(BASE_INDIVIDUAL));
      expect(mockCreateAssignment).toHaveBeenCalledOnce();
      expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
    });

    it("pasa los datos correctos al repositorio", async () => {
      await crearAssignment(
        null,
        makeFormData({ ...BASE_INDIVIDUAL, slug: "kata-funcional", descripcion: "Primera kata", deadline: "2026-06-30" })
      );
      expect(mockCreateAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: "Kata Funcional",
          slug: "kata-funcional",
          descripcion: "Primera kata",
          templateRepo: "kata-template",
          tipo: "individual",
          paradigma: "funcional",
          deadline: "2026-06-30",
        })
      );
    });

    it("genera el slug automáticamente si no se provee", async () => {
      await crearAssignment(null, makeFormData(BASE_INDIVIDUAL));
      expect(mockCreateAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ titulo: "Kata Funcional" })
      );
      // el slug es generado por el repositorio, no por la action
      expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
    });

    it("retorna error global si no hay comisión activa", async () => {
      mockCreateAssignment.mockRejectedValue(
        new FakeComisionActivaRequeridaError(
          "Necesitás una comisión activa para crear assignments."
        )
      );

      const result = await crearAssignment(null, makeFormData(BASE_INDIVIDUAL));

      expect(result).toEqual({
        ok: false,
        errors: {},
        formError: "Necesitás una comisión activa para crear assignments.",
      });
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe("assignment grupal", () => {
    it("crea el assignment grupal y redirige a /admin/assignments", async () => {
      await crearAssignment(null, makeFormData(BASE_GRUPAL));
      expect(mockCreateAssignment).toHaveBeenCalledOnce();
      expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
    });

    it("pasa maxIntegrantes como número al repositorio", async () => {
      await crearAssignment(null, makeFormData(BASE_GRUPAL));
      expect(mockCreateAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ maxIntegrantes: 3 })
      );
    });

    it("retorna error si falta maxIntegrantes en assignment grupal", async () => {
      const result = await crearAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, maxIntegrantes: undefined })
      );
      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.maxIntegrantes).toBeDefined();
      expect(mockCreateAssignment).not.toHaveBeenCalled();
    });
  });

  // Issue #109
  describe("columnaGrupoEnPlanilla", () => {
    it("pasa la columna como número al repositorio", async () => {
      await crearAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, columnaGrupoEnPlanilla: "5" })
      );
      expect(mockCreateAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ columnaGrupoEnPlanilla: 5 })
      );
    });

    it("\"\" se traduce a undefined (sin validar contra la comisión)", async () => {
      await crearAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, columnaGrupoEnPlanilla: "" })
      );
      expect(mockGetComisionActiva).not.toHaveBeenCalled();
      expect(mockCreateAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ columnaGrupoEnPlanilla: undefined })
      );
    });

    it("rechaza una columna ocupada por un dato personal de la comisión activa", async () => {
      mockGetComisionActiva.mockResolvedValue(fakeComision([5]));

      const result = await crearAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, columnaGrupoEnPlanilla: "5" })
      );

      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.columnaGrupoEnPlanilla).toBeDefined();
      expect(mockCreateAssignment).not.toHaveBeenCalled();
    });

    it("acepta una columna libre", async () => {
      mockGetComisionActiva.mockResolvedValue(fakeComision([0, 1, 2, 3, 4]));

      await crearAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, columnaGrupoEnPlanilla: "5" })
      );

      expect(mockCreateAssignment).toHaveBeenCalledOnce();
    });

    it("sin comisión activa no valida acá — deja que createAssignment lance ComisionActivaRequeridaError", async () => {
      mockGetComisionActiva.mockResolvedValue(null);
      mockCreateAssignment.mockRejectedValue(
        new FakeComisionActivaRequeridaError(
          "Necesitás una comisión activa para crear assignments."
        )
      );

      const result = await crearAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, columnaGrupoEnPlanilla: "5" })
      );

      expect(result).toEqual({
        ok: false,
        errors: {},
        formError: "Necesitás una comisión activa para crear assignments.",
      });
    });
  });

  describe("validaciones", () => {
    it("retorna error si falta el título", async () => {
      const result = await crearAssignment(
        null,
        makeFormData({ ...BASE_INDIVIDUAL, titulo: "" })
      );
      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.titulo).toBeDefined();
      expect(mockCreateAssignment).not.toHaveBeenCalled();
    });

    it("retorna error si falta el templateRepo", async () => {
      const result = await crearAssignment(
        null,
        makeFormData({ ...BASE_INDIVIDUAL, templateRepo: "" })
      );
      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.templateRepo).toBeDefined();
      expect(mockCreateAssignment).not.toHaveBeenCalled();
    });

    it("retorna error si el slug tiene caracteres inválidos", async () => {
      const result = await crearAssignment(
        null,
        makeFormData({ ...BASE_INDIVIDUAL, slug: "Kata Funcional!" })
      );
      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.slug).toBeDefined();
      expect(mockCreateAssignment).not.toHaveBeenCalled();
    });

    it("no llama a redirect cuando hay errores de validación", async () => {
      await crearAssignment(null, makeFormData({ ...BASE_INDIVIDUAL, titulo: "" }));
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});

// ── actualizarAssignment ─────────────────────────────────────

describe("actualizarAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockUpdateAssignment.mockResolvedValue({ id: "a1" });
    mockGetAssignment.mockResolvedValue({ comision: fakeComision() });
  });

  it("siempre llama a requireAdmin", async () => {
    await actualizarAssignment(null, makeFormData({ ...BASE_INDIVIDUAL, id: "a1" }));
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("actualiza el assignment y redirige a /admin/assignments", async () => {
    await actualizarAssignment(null, makeFormData({ ...BASE_INDIVIDUAL, id: "a1" }));
    expect(mockUpdateAssignment).toHaveBeenCalledWith("a1", expect.any(Object));
    expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
  });

  it("retorna error si la validación falla", async () => {
    const result = await actualizarAssignment(
      null,
      makeFormData({ ...BASE_INDIVIDUAL, id: "a1", titulo: "" })
    );
    expect(result).toMatchObject({ ok: false });
    expect(mockUpdateAssignment).not.toHaveBeenCalled();
  });

  // Issue #109
  describe("assignment grupal", () => {
    it("actualiza maxIntegrantes de un grupal existente", async () => {
      await actualizarAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, id: "a2", maxIntegrantes: "6" })
      );
      expect(mockUpdateAssignment).toHaveBeenCalledWith(
        "a2",
        expect.objectContaining({ maxIntegrantes: 6 })
      );
      expect(mockRedirect).toHaveBeenCalledWith("/admin/assignments");
    });

    it("pasa columnaGrupoEnPlanilla como número al repositorio", async () => {
      await actualizarAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, id: "a2", columnaGrupoEnPlanilla: "5" })
      );
      expect(mockUpdateAssignment).toHaveBeenCalledWith(
        "a2",
        expect.objectContaining({ columnaGrupoEnPlanilla: 5 })
      );
    });

    it("\"\" limpia la columna: llega al repositorio con la clave presente en undefined", async () => {
      await actualizarAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, id: "a2", columnaGrupoEnPlanilla: "" })
      );
      expect(mockGetAssignment).not.toHaveBeenCalled();
      const [, dataEnviada] = mockUpdateAssignment.mock.calls[0]!;
      expect("columnaGrupoEnPlanilla" in dataEnviada).toBe(true);
      expect(dataEnviada.columnaGrupoEnPlanilla).toBeUndefined();
    });

    it("rechaza una columna ocupada por un dato personal de la comisión del assignment", async () => {
      mockGetAssignment.mockResolvedValue({ comision: fakeComision([5]) });

      const result = await actualizarAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, id: "a2", columnaGrupoEnPlanilla: "5" })
      );

      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.columnaGrupoEnPlanilla).toBeDefined();
      expect(mockUpdateAssignment).not.toHaveBeenCalled();
    });

    it("usa la comisión del assignment (no la activa) para validar la columna", async () => {
      mockGetAssignment.mockResolvedValue({ comision: fakeComision([5]) });

      await actualizarAssignment(
        null,
        makeFormData({ ...BASE_GRUPAL, id: "a2", columnaGrupoEnPlanilla: "5" })
      );

      expect(mockGetAssignment).toHaveBeenCalledWith("a2");
      expect(mockGetComisionActiva).not.toHaveBeenCalled();
    });
  });
});

// ── volcarGruposALaPlanilla ──────────────────────────────────
// Issue #109

function makeVolcadoFormData(assignmentId: string): FormData {
  const fd = new FormData();
  fd.append("assignmentId", assignmentId);
  return fd;
}

describe("volcarGruposALaPlanilla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
  });

  it("siempre llama a requireAdmin", async () => {
    mockVolcarGruposAPlanilla.mockResolvedValue({ alumnosEscritos: 0, sinFila: [] });
    await volcarGruposALaPlanilla({ status: "idle" }, makeVolcadoFormData("a2"));
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("llama a volcarGruposAPlanilla con el assignmentId del form", async () => {
    mockVolcarGruposAPlanilla.mockResolvedValue({ alumnosEscritos: 0, sinFila: [] });
    await volcarGruposALaPlanilla({ status: "idle" }, makeVolcadoFormData("a2"));
    expect(mockVolcarGruposAPlanilla).toHaveBeenCalledWith("a2");
  });

  it("devuelve ok con alumnosEscritos y sinFila", async () => {
    mockVolcarGruposAPlanilla.mockResolvedValue({
      alumnosEscritos: 10,
      sinFila: ["forastero"],
    });

    const result = await volcarGruposALaPlanilla(
      { status: "idle" },
      makeVolcadoFormData("a2")
    );

    expect(result).toEqual({ status: "ok", alumnosEscritos: 10, sinFila: ["forastero"] });
  });

  it("captura PlanillaNoDisponibleError y reutiliza su mensaje (rol Editor)", async () => {
    mockVolcarGruposAPlanilla.mockRejectedValue(
      new PlanillaNoDisponibleError(new Error("403"))
    );

    const result = await volcarGruposALaPlanilla(
      { status: "idle" },
      makeVolcadoFormData("a2")
    );

    expect(result).toMatchObject({ status: "error" });
    if (result.status === "error") {
      expect(result.message).toContain("Editor");
    }
  });

  it("captura AssignmentNoEncontradoError", async () => {
    mockVolcarGruposAPlanilla.mockRejectedValue(new AssignmentNoEncontradoError("a2"));

    const result = await volcarGruposALaPlanilla(
      { status: "idle" },
      makeVolcadoFormData("a2")
    );

    expect(result).toMatchObject({ status: "error" });
  });

  it("captura AssignmentNoGrupalError", async () => {
    mockVolcarGruposAPlanilla.mockRejectedValue(new AssignmentNoGrupalError("a2"));

    const result = await volcarGruposALaPlanilla(
      { status: "idle" },
      makeVolcadoFormData("a2")
    );

    expect(result).toMatchObject({ status: "error" });
  });

  it("captura ColumnaDeGrupoNoConfiguradaError (sin columna configurada)", async () => {
    mockVolcarGruposAPlanilla.mockRejectedValue(
      new FakeColumnaDeGrupoNoConfiguradaError("no hay columna")
    );

    const result = await volcarGruposALaPlanilla(
      { status: "idle" },
      makeVolcadoFormData("a2")
    );

    expect(result).toMatchObject({ status: "error", message: "no hay columna" });
  });

  it("captura AssignmentSinComisionError", async () => {
    mockVolcarGruposAPlanilla.mockRejectedValue(
      new FakeAssignmentSinComisionError("sin comisión")
    );

    const result = await volcarGruposALaPlanilla(
      { status: "idle" },
      makeVolcadoFormData("a2")
    );

    expect(result).toMatchObject({ status: "error", message: "sin comisión" });
  });

  it("captura ColumnaDeGrupoOcupadaPorDatosPersonalesError (columna reasignada a un dato personal)", async () => {
    mockVolcarGruposAPlanilla.mockRejectedValue(
      new FakeColumnaDeGrupoOcupadaPorDatosPersonalesError("columna ocupada")
    );

    const result = await volcarGruposALaPlanilla(
      { status: "idle" },
      makeVolcadoFormData("a2")
    );

    expect(result).toMatchObject({ status: "error", message: "columna ocupada" });
  });

  it("relanza errores inesperados sin tragarlos", async () => {
    mockVolcarGruposAPlanilla.mockRejectedValue(new Error("DB caída"));

    await expect(
      volcarGruposALaPlanilla({ status: "idle" }, makeVolcadoFormData("a2"))
    ).rejects.toThrow("DB caída");
  });
});
