import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockCreateAssignment = vi.fn();
const mockUpdateAssignment = vi.fn();
const mockRedirect = vi.fn();

const { FakeComisionActivaRequeridaError } = vi.hoisted(() => ({
  FakeComisionActivaRequeridaError: class FakeComisionActivaRequeridaError extends Error {},
}));

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  ComisionActivaRequeridaError: FakeComisionActivaRequeridaError,
  createAssignment: (...args: unknown[]) => mockCreateAssignment(...args),
  updateAssignment: (...args: unknown[]) => mockUpdateAssignment(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { crearAssignment, actualizarAssignment } from "./actions";

// ── Helpers ──────────────────────────────────────────────────

function makeFormData(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.append(key, value);
  }
  return fd;
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
});
