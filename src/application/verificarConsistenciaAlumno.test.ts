import { describe, it, expect, vi, beforeEach } from "vitest";
import { Alumno } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetAlumnoByGithub = vi.fn();
const mockMarcarAlumnoSyncFallido = vi.fn();
const mockMarcarAlumnoSyncOk = vi.fn();
const mockUpsertarAlumnoEnSheets = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
  marcarAlumnoSyncFallido: (...args: unknown[]) =>
    mockMarcarAlumnoSyncFallido(...args),
  marcarAlumnoSyncOk: (...args: unknown[]) => mockMarcarAlumnoSyncOk(...args),
}));

vi.mock("@/infrastructure/sheets", () => ({
  upsertarAlumnoEnSheets: (...args: unknown[]) =>
    mockUpsertarAlumnoEnSheets(...args),
}));

import { verificarConsistenciaAlumno } from "./verificarConsistenciaAlumno";

// ── Helpers ──────────────────────────────────────────────────

const comision = {
  id: "c1",
  spreadsheetId: "sheet-xyz",
  columnConfig: {},
} as unknown as Parameters<typeof verificarConsistenciaAlumno>[1];

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  const alumno = new Alumno();
  alumno.id = "uuid-1";
  alumno.legajo = "12345";
  alumno.nombre = "Juan";
  alumno.apellido = "Garcia";
  alumno.githubUsername = "juangarcia";
  alumno.email = "juan@example.com";
  return Object.assign(alumno, overrides);
}

// ── Tests ────────────────────────────────────────────────────

describe("verificarConsistenciaAlumno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarcarAlumnoSyncFallido.mockResolvedValue(undefined);
    mockMarcarAlumnoSyncOk.mockResolvedValue(undefined);
  });

  it("no hace nada si el alumno no existe en DB", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);

    await expect(
      verificarConsistenciaAlumno("juangarcia", comision)
    ).resolves.toBeUndefined();

    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
    expect(mockMarcarAlumnoSyncFallido).not.toHaveBeenCalled();
    expect(mockMarcarAlumnoSyncOk).not.toHaveBeenCalled();
  });

  it("re-upsertea en Sheets con los datos del alumno y limpia el flag cuando funciona", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: true });

    await verificarConsistenciaAlumno("juangarcia", comision);

    expect(mockUpsertarAlumnoEnSheets).toHaveBeenCalledWith(
      {
        legajo: "12345",
        apellido: "Garcia",
        nombre: "Juan",
        githubUsername: "juangarcia",
        email: "juan@example.com",
      },
      "sheet-xyz",
      {}
    );
    expect(mockMarcarAlumnoSyncOk).toHaveBeenCalledWith("juangarcia");
    expect(mockMarcarAlumnoSyncFallido).not.toHaveBeenCalled();
  });

  it("prende el flag y propaga cuando el resultado de Sheets es no-ok", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockUpsertarAlumnoEnSheets.mockResolvedValue({
      ok: false,
      error: "Email inválido en planilla",
    });

    await expect(
      verificarConsistenciaAlumno("juangarcia", comision)
    ).rejects.toThrow("Email inválido en planilla");

    expect(mockMarcarAlumnoSyncFallido).toHaveBeenCalledWith("juangarcia");
    expect(mockMarcarAlumnoSyncOk).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("prende el flag y propaga cuando upsertarAlumnoEnSheets throwea", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const sheetsError = new Error("Sheets caído");
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockUpsertarAlumnoEnSheets.mockRejectedValue(sheetsError);

    await expect(
      verificarConsistenciaAlumno("juangarcia", comision)
    ).rejects.toBe(sheetsError);

    expect(mockMarcarAlumnoSyncFallido).toHaveBeenCalledWith("juangarcia");
    expect(mockMarcarAlumnoSyncOk).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("si marcarAlumnoSyncFallido también falla, propaga el error original (no enmascara)", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const sheetsError = new Error("Sheets caído");
    const flagError = new Error("DB hipada");
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockUpsertarAlumnoEnSheets.mockRejectedValue(sheetsError);
    mockMarcarAlumnoSyncFallido.mockRejectedValue(flagError);

    await expect(
      verificarConsistenciaAlumno("juangarcia", comision)
    ).rejects.toBe(sheetsError);

    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
