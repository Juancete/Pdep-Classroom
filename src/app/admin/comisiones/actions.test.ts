import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockCreateComision = vi.fn();
const mockUpdateComision = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/repositories", () => ({
  createComision: (...args: unknown[]) => mockCreateComision(...args),
  updateComision: (...args: unknown[]) => mockUpdateComision(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { crearComision, actualizarComision } from "./actions";

// ── Helpers ──────────────────────────────────────────────────

function makeFormData(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.append(key, value);
  }
  return fd;
}

const BASE = {
  anio: "2026",
  spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
};

// ── crearComision ────────────────────────────────────────────

describe("crearComision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockCreateComision.mockResolvedValue({ id: "c1" });
  });

  it("siempre llama a requireAdmin", async () => {
    await crearComision(null, makeFormData(BASE));
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("crea la comisión y redirige a /admin/comisiones", async () => {
    await crearComision(null, makeFormData(BASE));
    expect(mockCreateComision).toHaveBeenCalledOnce();
    expect(mockRedirect).toHaveBeenCalledWith("/admin/comisiones");
  });

  it("pasa los datos correctos al repositorio", async () => {
    await crearComision(null, makeFormData({ ...BASE, anio: "2025" }));
    expect(mockCreateComision).toHaveBeenCalledWith(
      expect.objectContaining({
        anio: 2025,
        spreadsheetId: BASE.spreadsheetId,
        activa: false,
      })
    );
  });

  it("activa=true cuando viene el checkbox marcado", async () => {
    await crearComision(null, makeFormData({ ...BASE, activa: "on" }));
    expect(mockCreateComision).toHaveBeenCalledWith(
      expect.objectContaining({ activa: true })
    );
  });

  it("activa=false cuando no viene el checkbox", async () => {
    await crearComision(null, makeFormData(BASE)); // sin activa
    expect(mockCreateComision).toHaveBeenCalledWith(
      expect.objectContaining({ activa: false })
    );
  });

  describe("validaciones", () => {
    it("retorna error si falta el año", async () => {
      const result = await crearComision(
        null,
        makeFormData({ ...BASE, anio: undefined })
      );
      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.anio).toBeDefined();
      expect(mockCreateComision).not.toHaveBeenCalled();
    });

    it("retorna error si el año es inválido (< 2020)", async () => {
      const result = await crearComision(
        null,
        makeFormData({ ...BASE, anio: "1999" })
      );
      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.anio).toBeDefined();
      expect(mockCreateComision).not.toHaveBeenCalled();
    });

    it("retorna error si falta el spreadsheetId", async () => {
      const result = await crearComision(
        null,
        makeFormData({ ...BASE, spreadsheetId: "" })
      );
      expect(result).toMatchObject({ ok: false });
      expect(result?.errors?.spreadsheetId).toBeDefined();
      expect(mockCreateComision).not.toHaveBeenCalled();
    });

    it("no redirige cuando hay errores de validación", async () => {
      await crearComision(null, makeFormData({ ...BASE, spreadsheetId: "" }));
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});

// ── actualizarComision ───────────────────────────────────────

describe("actualizarComision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockUpdateComision.mockResolvedValue({ id: "c1" });
  });

  it("siempre llama a requireAdmin", async () => {
    await actualizarComision(null, makeFormData({ ...BASE, id: "c1" }));
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("actualiza la comisión y redirige a /admin/comisiones", async () => {
    await actualizarComision(null, makeFormData({ ...BASE, id: "c1" }));
    expect(mockUpdateComision).toHaveBeenCalledWith("c1", expect.any(Object));
    expect(mockRedirect).toHaveBeenCalledWith("/admin/comisiones");
  });

  it("pasa el id correcto al repositorio", async () => {
    await actualizarComision(null, makeFormData({ ...BASE, id: "c1" }));
    expect(mockUpdateComision).toHaveBeenCalledWith("c1", expect.any(Object));
  });

  it("retorna error si la validación falla", async () => {
    const result = await actualizarComision(
      null,
      makeFormData({ ...BASE, id: "c1", spreadsheetId: "" })
    );
    expect(result).toMatchObject({ ok: false });
    expect(mockUpdateComision).not.toHaveBeenCalled();
  });
});
