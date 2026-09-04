import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockSincronizarGruposDelAlumno = vi.fn();
const mockMarcarGruposSyncOk = vi.fn();
const mockMarcarGruposSyncFallido = vi.fn();

vi.mock("./grupoSync", () => ({
  sincronizarGruposDelAlumno: (...args: unknown[]) =>
    mockSincronizarGruposDelAlumno(...args),
}));

vi.mock("@/infrastructure/repositories", () => ({
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

  it("limpia el flag cuando la sync funciona", async () => {
    await expect(
      intentarSincronizarGrupos("juangarcia", comision)
    ).resolves.toBeUndefined();

    expect(mockSincronizarGruposDelAlumno).toHaveBeenCalledWith("juangarcia", comision, undefined);
    expect(mockMarcarGruposSyncOk).toHaveBeenCalledWith("juangarcia");
    expect(mockMarcarGruposSyncFallido).not.toHaveBeenCalled();
  });

  it("loguea, prende el flag y propaga cuando la sync throwea", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const syncError = new Error("Sheets caído");
    mockSincronizarGruposDelAlumno.mockRejectedValue(syncError);

    await expect(
      intentarSincronizarGrupos("juangarcia", comision)
    ).rejects.toBe(syncError);

    expect(mockMarcarGruposSyncFallido).toHaveBeenCalledWith("juangarcia");
    expect(mockMarcarGruposSyncOk).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    const [context] = errorSpy.mock.calls[0];
    expect(context).toMatchObject({ githubUsername: "juangarcia", comisionId: "c1" });
    errorSpy.mockRestore();
  });

  it("si marcarGruposSyncFallido también falla, loguea ambos y propaga el error original de sync", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const syncError = new Error("Sheets caído");
    const flagError = new Error("DB hipada");
    mockSincronizarGruposDelAlumno.mockRejectedValue(syncError);
    mockMarcarGruposSyncFallido.mockRejectedValue(flagError);

    await expect(
      intentarSincronizarGrupos("juangarcia", comision)
    ).rejects.toBe(syncError);

    // El error original (sync) se propaga; el de flag solo se loguea para
    // diagnóstico — la causa real es la sync, y nunca queremos enmascararla.
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("si marcarGruposSyncOk falla tras una sync exitosa, propaga ese error", async () => {
    const flagError = new Error("DB hipada al limpiar flag");
    mockMarcarGruposSyncOk.mockRejectedValue(flagError);

    await expect(
      intentarSincronizarGrupos("juangarcia", comision)
    ).rejects.toBe(flagError);

    expect(mockSincronizarGruposDelAlumno).toHaveBeenCalled();
    expect(mockMarcarGruposSyncFallido).not.toHaveBeenCalled();
  });

  it("forwardea asignacionesPrefetched al comando puro (resync masivo con lectura única)", async () => {
    const prefetched = [
      { githubUsername: "juangarcia", paradigma: "funcional" as const, nombreGrupo: "X" },
    ];

    await intentarSincronizarGrupos("juangarcia", comision, prefetched);

    expect(mockSincronizarGruposDelAlumno).toHaveBeenCalledWith(
      "juangarcia",
      comision,
      prefetched
    );
  });
});
