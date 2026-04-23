import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockSincronizarGruposDelAlumno = vi.fn();
const mockMarcarGruposSyncOk = vi.fn();
const mockMarcarGruposSyncFallido = vi.fn();

vi.mock("./grupoSync", () => ({
  sincronizarGruposDelAlumno: (...args: unknown[]) =>
    mockSincronizarGruposDelAlumno(...args),
}));

vi.mock("@/lib/repositories", () => ({
  marcarGruposSyncOk: (...args: unknown[]) => mockMarcarGruposSyncOk(...args),
  marcarGruposSyncFallido: (...args: unknown[]) =>
    mockMarcarGruposSyncFallido(...args),
}));

import { intentarSincronizarGrupos } from "./intentarSincronizarGrupos";

// ── Helpers ──────────────────────────────────────────────────

const comision = {
  id: "c1",
  spreadsheetId: "sheet-xyz",
  columnConfig: {},
} as unknown as Parameters<typeof intentarSincronizarGrupos>[1];

// ── Tests ────────────────────────────────────────────────────

describe("intentarSincronizarGrupos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSincronizarGruposDelAlumno.mockResolvedValue(undefined);
    mockMarcarGruposSyncOk.mockResolvedValue(undefined);
    mockMarcarGruposSyncFallido.mockResolvedValue(undefined);
  });

  it("retorna false y limpia el flag cuando la sync funciona", async () => {
    const result = await intentarSincronizarGrupos("juangarcia", comision);

    expect(result).toBe(false);
    expect(mockSincronizarGruposDelAlumno).toHaveBeenCalledWith("juangarcia", comision);
    expect(mockMarcarGruposSyncOk).toHaveBeenCalledWith("juangarcia");
    expect(mockMarcarGruposSyncFallido).not.toHaveBeenCalled();
  });

  it("retorna true, loguea y prende el flag cuando la sync throwea", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    mockSincronizarGruposDelAlumno.mockRejectedValue(new Error("Sheets caído"));

    const result = await intentarSincronizarGrupos("juangarcia", comision);

    expect(result).toBe(true);
    expect(mockMarcarGruposSyncFallido).toHaveBeenCalledWith("juangarcia");
    expect(mockMarcarGruposSyncOk).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    const [context] = errorSpy.mock.calls[0];
    expect(context).toMatchObject({ githubUsername: "juangarcia", comisionId: "c1" });
    errorSpy.mockRestore();
  });

  it("no propaga el error: es un wrapper que absorbe para reportar por su return", async () => {
    const errorSpy = vi
      .spyOn((await import("@/lib/logger")).logger, "error")
      .mockImplementation(() => {});
    mockSincronizarGruposDelAlumno.mockRejectedValue(new Error("boom"));

    await expect(
      intentarSincronizarGrupos("juangarcia", comision)
    ).resolves.toBe(true);

    errorSpy.mockRestore();
  });
});
