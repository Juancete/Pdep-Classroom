import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireAdmin = vi.fn();
const mockCreateComision = vi.fn();
const mockUpdateComision = vi.fn();
const mockGetComision = vi.fn();
const mockRedirect = vi.fn();
const mockGetAsignacionesGrupos = vi.fn();
const mockGetAlumnosByComision = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();
const mockImportarAlumnosDeComision = vi.fn();
const mockGetAlumnosConGoogleGroupPendiente = vi.fn();
const mockIntentarSincronizarGoogleGroup = vi.fn();
const mockIsGoogleGroupsConfigured = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const { FakeLegajoConflictError, FakeComisionActivaDuplicadaError } = vi.hoisted(() => {
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
  class FakeComisionActivaDuplicadaError extends Error {
    constructor() {
      super("Ya existe otra comisión activa.");
      this.name = "ComisionActivaDuplicadaError";
    }
  }
  return { FakeLegajoConflictError, FakeComisionActivaDuplicadaError };
});

vi.mock("@/lib/repositories", () => ({
  createComision: (...args: unknown[]) => mockCreateComision(...args),
  updateComision: (...args: unknown[]) => mockUpdateComision(...args),
  getComision: (...args: unknown[]) => mockGetComision(...args),
  getAlumnosByComision: (...args: unknown[]) =>
    mockGetAlumnosByComision(...args),
  getAlumnosConGoogleGroupPendiente: (...args: unknown[]) =>
    mockGetAlumnosConGoogleGroupPendiente(...args),
  LegajoConflictError: FakeLegajoConflictError,
  ComisionActivaDuplicadaError: FakeComisionActivaDuplicadaError,
}));

vi.mock("@/lib/services/intentarSincronizarGrupos", () => ({
  intentarSincronizarGrupos: (...args: unknown[]) =>
    mockIntentarSincronizarGrupos(...args),
}));

vi.mock("@/lib/services/intentarSincronizarGoogleGroup", () => ({
  intentarSincronizarGoogleGroup: (...args: unknown[]) =>
    mockIntentarSincronizarGoogleGroup(...args),
}));

vi.mock("@/lib/googleGroups", () => ({
  isGoogleGroupsConfigured: () => mockIsGoogleGroupsConfigured(),
}));

const { FakeLecturaPlanillaAlumnosError } = vi.hoisted(() => {
  class FakeLecturaPlanillaAlumnosError extends Error {
    constructor(cause: unknown) {
      const message = cause instanceof Error ? cause.message : "Error desconocido";
      super(`No se pudo leer la planilla: ${message}`);
      this.name = "LecturaPlanillaAlumnosError";
    }
  }
  return { FakeLecturaPlanillaAlumnosError };
});

vi.mock("@/lib/services/importarAlumnosDeComision", () => ({
  importarAlumnosDeComision: (...args: unknown[]) =>
    mockImportarAlumnosDeComision(...args),
  LecturaPlanillaAlumnosError: FakeLecturaPlanillaAlumnosError,
}));

vi.mock("@/lib/sheets", () => ({
  getAsignacionesGrupos: (...args: unknown[]) => mockGetAsignacionesGrupos(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  crearComision,
  actualizarComision,
  sincronizarAlumnos,
  sincronizarGruposDeLaComision,
  sincronizarGoogleGroupsDeLaComision,
} from "./actions";

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

  it("retorna error de activa si otra request activó una comisión al mismo tiempo", async () => {
    mockCreateComision.mockRejectedValue(new FakeComisionActivaDuplicadaError());

    const result = await crearComision(
      null,
      makeFormData({ ...BASE, activa: "on" })
    );

    expect(result).toEqual({
      ok: false,
      errors: {
        activa: [
          "Otra comisión fue activada al mismo tiempo. Recargá la página y volvé a intentar.",
        ],
      },
    });
    expect(mockRedirect).not.toHaveBeenCalled();
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

  it("retorna error de activa si otra request activó una comisión al mismo tiempo", async () => {
    mockUpdateComision.mockRejectedValue(new FakeComisionActivaDuplicadaError());

    const result = await actualizarComision(
      null,
      makeFormData({ ...BASE, id: "c1", activa: "on" })
    );

    expect(result).toEqual({
      ok: false,
      errors: {
        activa: [
          "Otra comisión fue activada al mismo tiempo. Recargá la página y volvé a intentar.",
        ],
      },
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

// ── sincronizarAlumnos ───────────────────────────────────────

describe("sincronizarAlumnos", () => {
  const comisionMock = { id: "c1", spreadsheetId: "sheet-abc", columnConfig: {} };

  function makeSync(fields: Record<string, string> = {}) {
    return makeFormData({ comisionId: "c1", ...fields });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetComision.mockResolvedValue(comisionMock);
    mockImportarAlumnosDeComision.mockResolvedValue({
      sincronizados: 0,
      conErrorDeGrupo: 0,
    });
  });

  it("siempre llama a requireAdmin", async () => {
    await sincronizarAlumnos({ status: "idle" }, makeSync());
    expect(mockRequireAdmin).toHaveBeenCalledOnce();
  });

  it("retorna error si la comisión no existe", async () => {
    mockGetComision.mockResolvedValue(null);
    const result = await sincronizarAlumnos({ status: "idle" }, makeSync());
    expect(result).toEqual({ status: "error", message: "Comisión no encontrada" });
    expect(mockImportarAlumnosDeComision).not.toHaveBeenCalled();
  });

  it("retorna error si no se puede leer la planilla", async () => {
    mockImportarAlumnosDeComision.mockRejectedValue(
      new FakeLecturaPlanillaAlumnosError(new Error("acceso denegado"))
    );
    const result = await sincronizarAlumnos({ status: "idle" }, makeSync());
    expect(result).toEqual({
      status: "error",
      message: "No se pudo leer la planilla: acceso denegado",
    });
  });

  it("sincroniza correctamente y retorna el conteo con conErrorDeGrupo:0", async () => {
    mockImportarAlumnosDeComision.mockResolvedValue({
      sincronizados: 2,
      conErrorDeGrupo: 0,
    });

    const result = await sincronizarAlumnos({ status: "idle" }, makeSync());

    expect(result).toEqual({ status: "ok", sincronizados: 2, conErrorDeGrupo: 0 });
    expect(mockImportarAlumnosDeComision).toHaveBeenCalledWith(comisionMock);
  });

  it("delega la importación al servicio de aplicación", async () => {
    mockImportarAlumnosDeComision.mockResolvedValue({
      sincronizados: 1,
      conErrorDeGrupo: 0,
    });

    await sincronizarAlumnos({ status: "idle" }, makeSync());

    expect(mockImportarAlumnosDeComision).toHaveBeenCalledWith(comisionMock);
  });

  it("retorna 0 sincronizados si la planilla está vacía", async () => {
    const result = await sincronizarAlumnos({ status: "idle" }, makeSync());
    expect(result).toEqual({ status: "ok", sincronizados: 0, conErrorDeGrupo: 0 });
  });

  it("retorna error controlado si el servicio propaga LegajoConflictError", async () => {
    mockImportarAlumnosDeComision.mockRejectedValue(
      new FakeLegajoConflictError("111", "otra-persona")
    );

    const result = await sincronizarAlumnos({ status: "idle" }, makeSync());

    expect(result).toEqual({
      status: "error",
      message: "El legajo 111 ya está registrado con el usuario @otra-persona. Verificá que sea el tuyo.",
    });
  });

  it("cuenta conErrorDeGrupo cuando algún hook de Google Groups falla", async () => {
    mockImportarAlumnosDeComision.mockResolvedValue({
      sincronizados: 3,
      conErrorDeGrupo: 1,
    });

    const result = await sincronizarAlumnos({ status: "idle" }, makeSync());

    expect(result).toEqual({ status: "ok", sincronizados: 3, conErrorDeGrupo: 1 });
  });
});

// ── sincronizarGruposDeLaComision ────────────────────────────

describe("sincronizarGruposDeLaComision", () => {
  const gruposConfig = {
    sheetName: "Alumnos",
    headerRows: 1,
    githubUsername: 3,
    nombreGrupoPorParadigma: { funcional: 5 },
  };
  const comision = {
    id: "c1",
    spreadsheetId: "sheet-xyz",
    columnConfig: { grupos: gruposConfig },
    gruposConfig: () => gruposConfig,
  };
  const asignacionesFake = [
    { githubUsername: "ana", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
  ];

  function makeFd(): FormData {
    const fd = new FormData();
    fd.append("comisionId", "c1");
    return fd;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetComision.mockResolvedValue(comision);
    mockGetAlumnosByComision.mockResolvedValue([]);
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
    mockGetAsignacionesGrupos.mockResolvedValue(asignacionesFake);
  });

  it("devuelve error si la comisión no existe", async () => {
    mockGetComision.mockResolvedValue(null);
    const result = await sincronizarGruposDeLaComision({ status: "idle" }, makeFd());
    expect(result).toEqual({ status: "error", message: "Comisión no encontrada" });
    expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
  });

  it("devuelve ok con 0 sincronizados cuando no hay alumnos en la comisión", async () => {
    const result = await sincronizarGruposDeLaComision({ status: "idle" }, makeFd());
    expect(result).toEqual({ status: "ok", sincronizados: 0, aunConError: 0 });
    expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
    expect(mockGetAsignacionesGrupos).not.toHaveBeenCalled();
  });

  it("corre para todos los alumnos de la comisión (no solo los pendientes)", async () => {
    mockGetAlumnosByComision.mockResolvedValue([
      { githubUsername: "ana", gruposSyncFallidoEn: null },
      { githubUsername: "bruno", gruposSyncFallidoEn: null },
    ]);

    await sincronizarGruposDeLaComision({ status: "idle" }, makeFd());

    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledTimes(2);
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith("ana", comision, asignacionesFake);
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith("bruno", comision, asignacionesFake);
  });

  it("lee la hoja de grupos una sola vez y reutiliza el resultado en cada alumno", async () => {
    mockGetAlumnosByComision.mockResolvedValue([
      { githubUsername: "ana" },
      { githubUsername: "bruno" },
      { githubUsername: "cintia" },
    ]);

    await sincronizarGruposDeLaComision({ status: "idle" }, makeFd());

    expect(mockGetAsignacionesGrupos).toHaveBeenCalledTimes(1);
    expect(mockGetAsignacionesGrupos).toHaveBeenCalledWith("sheet-xyz", gruposConfig);
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledTimes(3);
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith("ana", comision, asignacionesFake);
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith("bruno", comision, asignacionesFake);
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith("cintia", comision, asignacionesFake);
  });

  it("devuelve error y no sincroniza nada si la lectura única de la hoja falla", async () => {
    mockGetAlumnosByComision.mockResolvedValue([{ githubUsername: "ana" }]);
    mockGetAsignacionesGrupos.mockRejectedValue(new Error("No se pudo leer la hoja de grupos: rate limited"));

    const result = await sincronizarGruposDeLaComision({ status: "idle" }, makeFd());

    expect(result).toEqual({
      status: "error",
      message: "No se pudo leer la hoja de grupos: rate limited",
    });
    expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
  });

  it("no lee la hoja si la comisión no tiene config de grupos", async () => {
    mockGetComision.mockResolvedValue({ id: "c1", spreadsheetId: "sheet-xyz", columnConfig: {}, gruposConfig: () => undefined });
    mockGetAlumnosByComision.mockResolvedValue([{ githubUsername: "ana" }]);

    await sincronizarGruposDeLaComision({ status: "idle" }, makeFd());

    expect(mockGetAsignacionesGrupos).not.toHaveBeenCalled();
    expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith(
      "ana",
      expect.objectContaining({ id: "c1" }),
      undefined
    );
  });

  it("cuenta cuántos se resolvieron y cuántos siguen con error", async () => {
    mockGetAlumnosByComision.mockResolvedValue([
      { githubUsername: "ana" },
      { githubUsername: "bruno" },
      { githubUsername: "cintia" },
    ]);
    mockIntentarSincronizarGrupos
      .mockResolvedValueOnce(undefined) // ana: ok
      .mockRejectedValueOnce(new Error("sigue fallando")) // bruno
      .mockResolvedValueOnce(undefined); // cintia: ok

    const result = await sincronizarGruposDeLaComision({ status: "idle" }, makeFd());

    expect(result).toEqual({ status: "ok", sincronizados: 2, aunConError: 1 });
  });

  it("requiere admin antes de ejecutar", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(
      sincronizarGruposDeLaComision({ status: "idle" }, makeFd())
    ).rejects.toThrow("forbidden");
  });
});

describe("sincronizarGoogleGroupsDeLaComision", () => {
  function makeFd(): FormData {
    return makeFormData({ comisionId: "c1" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockGetComision.mockResolvedValue({ id: "c1" });
    mockGetAlumnosConGoogleGroupPendiente.mockResolvedValue([]);
    mockIsGoogleGroupsConfigured.mockReturnValue(true);
  });

  it("requiere admin", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("forbidden"));
    await expect(
      sincronizarGoogleGroupsDeLaComision({ status: "idle" }, makeFd())
    ).rejects.toThrow("forbidden");
  });

  it("devuelve error si la comisión no existe", async () => {
    mockGetComision.mockResolvedValue(null);
    await expect(
      sincronizarGoogleGroupsDeLaComision({ status: "idle" }, makeFd())
    ).resolves.toEqual({
      status: "error",
      message: "Comisión no encontrada",
    });
  });

  it("procesa solo pendientes y agrega los resultados", async () => {
    mockGetAlumnosConGoogleGroupPendiente.mockResolvedValue([
      { githubUsername: "ana" },
      { githubUsername: "bruno" },
      { githubUsername: "cintia" },
    ]);
    mockIntentarSincronizarGoogleGroup
      .mockResolvedValueOnce({ status: "added" })
      .mockResolvedValueOnce({ status: "skipped" })
      .mockResolvedValueOnce({ status: "error", error: "boom" });

    await expect(
      sincronizarGoogleGroupsDeLaComision({ status: "idle" }, makeFd())
    ).resolves.toEqual({
      status: "ok",
      sincronizados: 1,
      omitidos: 1,
      aunConError: 1,
    });
    expect(mockGetAlumnosConGoogleGroupPendiente).toHaveBeenCalledWith(
      "c1",
      true
    );
  });

  it("continúa con el lote cuando un alumno lanza una excepción", async () => {
    mockGetAlumnosConGoogleGroupPendiente.mockResolvedValue([
      { githubUsername: "ana" },
      { githubUsername: "bruno" },
    ]);
    mockIntentarSincronizarGoogleGroup
      .mockRejectedValueOnce(new Error("error inesperado"))
      .mockResolvedValueOnce({ status: "added" });

    await expect(
      sincronizarGoogleGroupsDeLaComision({ status: "idle" }, makeFd())
    ).resolves.toEqual({
      status: "ok",
      sincronizados: 1,
      omitidos: 0,
      aunConError: 1,
    });
    expect(mockIntentarSincronizarGoogleGroup).toHaveBeenCalledTimes(2);
  });

  it("no incluye omitidos cuando la integración está desactivada", async () => {
    mockIsGoogleGroupsConfigured.mockReturnValue(false);

    await expect(
      sincronizarGoogleGroupsDeLaComision({ status: "idle" }, makeFd())
    ).resolves.toEqual({
      status: "ok",
      sincronizados: 0,
      omitidos: 0,
      aunConError: 0,
    });
    expect(mockGetAlumnosConGoogleGroupPendiente).toHaveBeenCalledWith(
      "c1",
      false
    );
  });
});
