import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockGetComisionActiva = vi.fn();
const mockUpsertAlumno = vi.fn();
const mockMarcarRegistroConfirmado = vi.fn();
const mockUpsertarAlumnoEnSheets = vi.fn();

const { FakeLegajoConflictError } = vi.hoisted(() => {
  class FakeLegajoConflictError extends Error {
    constructor(
      public readonly legajo: string,
      public readonly otroGithubUsername: string
    ) {
      super(
        `El legajo ${legajo} ya está registrado con el usuario @${otroGithubUsername}. Verificá que sea el tuyo.`
      );
      this.name = "LegajoConflictError";
    }
  }
  return { FakeLegajoConflictError };
});

vi.mock("@/lib/repositories", () => ({
  getComisionActiva: () => mockGetComisionActiva(),
  upsertAlumno: (data: unknown) => mockUpsertAlumno(data),
  marcarRegistroConfirmado: (...args: unknown[]) =>
    mockMarcarRegistroConfirmado(...args),
  LegajoConflictError: FakeLegajoConflictError,
}));

// Para `validateRegistro` usamos la implementación real: es pura y testearla
// con el mock sería tautológico. Sólo mockeamos el upsert que toca la red.
vi.mock("@/lib/sheets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sheets")>("@/lib/sheets");
  return {
    ...actual,
    upsertarAlumnoEnSheets: (...args: unknown[]) =>
      mockUpsertarAlumnoEnSheets(...args),
  };
});

import { confirmarDatosAlumno } from "./alumnoRegistro";

// ── Helpers ──────────────────────────────────────────────────

const comisionActiva = {
  id: "c1",
  spreadsheetId: "sheet-xyz",
  columnConfig: {
    sheetName: "Alumnos",
    headerRows: 1,
    legajo: 0,
    apellido: 1,
    nombre: 2,
    githubUsername: 3,
    email: 4,
  },
};

const validInput = {
  legajo: "12345",
  apellido: "García",
  nombre: "Juan",
  githubUsername: "juangarcia",
  email: "juan@gmail.com",
};

// ── Tests ────────────────────────────────────────────────────

describe("confirmarDatosAlumno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetComisionActiva.mockResolvedValue(comisionActiva);
    mockUpsertAlumno.mockResolvedValue(undefined);
    mockMarcarRegistroConfirmado.mockResolvedValue(undefined);
    mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: true });
  });

  it("devuelve { ok: true, comision } cuando todo el flujo funciona", async () => {
    const resultado = await confirmarDatosAlumno(validInput);
    expect(resultado).toEqual({ ok: true, comision: comisionActiva });
  });

  it("persiste en DB antes de tocar Sheets (DB-primero)", async () => {
    await confirmarDatosAlumno(validInput);
    const ordenLlamadas = [
      mockUpsertAlumno.mock.invocationCallOrder[0],
      mockUpsertarAlumnoEnSheets.mock.invocationCallOrder[0],
    ];
    expect(ordenLlamadas[0]).toBeLessThan(ordenLlamadas[1]);
  });

  it("pasa la comisión activa como comision a upsertAlumno, sin marcar registroConfirmadoEn todavía", async () => {
    await confirmarDatosAlumno(validInput);
    const [dataPasada] = mockUpsertAlumno.mock.calls[0];
    expect(dataPasada).toMatchObject({ comision: comisionActiva });
    expect(dataPasada.registroConfirmadoEn).toBeUndefined();
  });

  it("marca registroConfirmadoEn recién después de que Sheets confirmó la escritura", async () => {
    await confirmarDatosAlumno(validInput);
    expect(mockMarcarRegistroConfirmado).toHaveBeenCalledWith(
      validInput.githubUsername,
      comisionActiva
    );
    const ordenLlamadas = [
      mockUpsertarAlumnoEnSheets.mock.invocationCallOrder[0],
      mockMarcarRegistroConfirmado.mock.invocationCallOrder[0],
    ];
    expect(ordenLlamadas[0]).toBeLessThan(ordenLlamadas[1]);
  });

  it("no marca registroConfirmadoEn si Sheets falla (evita commit parcial)", async () => {
    mockUpsertarAlumnoEnSheets.mockResolvedValue({
      ok: false,
      error: "No se pudo escribir en la planilla",
    });
    await confirmarDatosAlumno(validInput);
    expect(mockMarcarRegistroConfirmado).not.toHaveBeenCalled();
  });

  it("loguea el caso raro en que Sheets confirmó pero marcar registroConfirmadoEn falló", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation((() => {}) as never);
    mockMarcarRegistroConfirmado.mockRejectedValue(new Error("DB caída"));

    await expect(confirmarDatosAlumno(validInput)).rejects.toThrow("DB caída");

    expect(errorSpy).toHaveBeenCalledOnce();
    const [context, message] = errorSpy.mock.calls[0];
    expect(context).toMatchObject({
      githubUsername: validInput.githubUsername,
      comisionId: comisionActiva.id,
    });
    expect(message).toContain("Sheets confirmado");
    errorSpy.mockRestore();
  });

  it("pasa a Sheets el spreadsheetId y columnConfig de la comisión activa", async () => {
    await confirmarDatosAlumno(validInput);
    expect(mockUpsertarAlumnoEnSheets).toHaveBeenCalledWith(
      validInput,
      comisionActiva.spreadsheetId,
      comisionActiva.columnConfig
    );
  });

  describe("sin comisión activa", () => {
    it("devuelve 409 sin tocar DB ni Sheets", async () => {
      mockGetComisionActiva.mockResolvedValue(null);
      const resultado = await confirmarDatosAlumno(validInput);
      expect(resultado).toMatchObject({ ok: false, status: 409 });
      expect(mockUpsertAlumno).not.toHaveBeenCalled();
      expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
    });

    it("el error sugiere crear una comisión en admin", async () => {
      mockGetComisionActiva.mockResolvedValue(null);
      const resultado = await confirmarDatosAlumno(validInput);
      if (resultado.ok) expect.fail("debería haber fallado");
      expect(resultado.error).toContain("/admin/comisiones");
    });
  });

  describe("validación de inputs", () => {
    it("devuelve 400 si el email es inválido, sin tocar DB ni Sheets", async () => {
      const resultado = await confirmarDatosAlumno({
        ...validInput,
        email: "no-es-email",
      });
      expect(resultado).toMatchObject({ ok: false, status: 400 });
      if (resultado.ok) expect.fail();
      expect(resultado.error).toContain("email");
      expect(mockUpsertAlumno).not.toHaveBeenCalled();
      expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
    });

    it("devuelve 400 si el legajo es corto", async () => {
      const resultado = await confirmarDatosAlumno({ ...validInput, legajo: "12" });
      expect(resultado).toMatchObject({ ok: false, status: 400 });
    });
  });

  describe("conflicto de legajo en DB", () => {
    beforeEach(() => {
      mockUpsertAlumno.mockRejectedValue(
        new FakeLegajoConflictError("12345", "otro-alumno")
      );
    });

    it("devuelve 400 con field=legajo y nombra al github conflictivo", async () => {
      const resultado = await confirmarDatosAlumno(validInput);
      expect(resultado).toMatchObject({
        ok: false,
        status: 400,
        field: "legajo",
      });
      if (resultado.ok) expect.fail();
      expect(resultado.error).toContain("otro-alumno");
    });

    it("no toca Sheets si la DB rechazó el upsert", async () => {
      await confirmarDatosAlumno(validInput);
      expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
    });
  });

  describe("error al escribir en Sheets", () => {
    it("devuelve 400 con el error de la planilla", async () => {
      mockUpsertarAlumnoEnSheets.mockResolvedValue({
        ok: false,
        error: "No se pudo escribir en la planilla",
      });
      const resultado = await confirmarDatosAlumno(validInput);
      expect(resultado).toEqual({
        ok: false,
        status: 400,
        error: "No se pudo escribir en la planilla",
      });
    });
  });

  it("deja propagar errores inesperados del upsert en DB (no-LegajoConflictError)", async () => {
    mockUpsertAlumno.mockRejectedValue(new Error("conexión caída"));
    await expect(confirmarDatosAlumno(validInput)).rejects.toThrow("conexión caída");
  });
});
