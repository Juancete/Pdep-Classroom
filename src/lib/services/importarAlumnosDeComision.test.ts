import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAlumnos = vi.fn();
const mockGetAlumnosByGithubUsernames = vi.fn();
const mockUpsertAlumnos = vi.fn();
const mockEjecutarHooksPostConfirmacion = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();

vi.mock("@/lib/sheets", () => ({
  getAlumnos: (...args: unknown[]) => mockGetAlumnos(...args),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnosByGithubUsernames: (...args: unknown[]) =>
    mockGetAlumnosByGithubUsernames(...args),
  upsertAlumnos: (...args: unknown[]) => mockUpsertAlumnos(...args),
}));

vi.mock("./hooksPostConfirmacion", () => ({
  ejecutarHooksPostConfirmacion: (...args: unknown[]) =>
    mockEjecutarHooksPostConfirmacion(...args),
  HOOKS_IMPORTACION_ALUMNO: ["google-groups-hook"],
}));

vi.mock("./intentarSincronizarGrupos", () => ({
  intentarSincronizarGrupos: (...args: unknown[]) =>
    mockIntentarSincronizarGrupos(...args),
}));

import {
  importarAlumnosDeComision,
  LecturaPlanillaAlumnosError,
} from "./importarAlumnosDeComision";

describe("importarAlumnosDeComision", () => {
  const comision = { id: "c1", spreadsheetId: "sheet-abc", columnConfig: {} };
  const alumnos = [
    {
      legajo: "111",
      nombre: "Ana",
      apellido: "López",
      githubUsername: "Ana",
      email: "ana-nuevo@b.com",
    },
    {
      legajo: "222",
      nombre: "Beto",
      apellido: "Ruiz",
      githubUsername: "beto",
      email: "beto@b.com",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAlumnos.mockResolvedValue(alumnos);
    mockGetAlumnosByGithubUsernames.mockResolvedValue([]);
    mockUpsertAlumnos.mockResolvedValue(2);
    mockEjecutarHooksPostConfirmacion.mockResolvedValue({ groupSubscription: "added" });
  });

  it("lee alumnos desde la planilla configurada de la comisión", async () => {
    await importarAlumnosDeComision(comision as never);
    expect(mockGetAlumnos).toHaveBeenCalledWith("sheet-abc", {});
  });

  it("captura emails previos antes de upsertAlumnos", async () => {
    await importarAlumnosDeComision(comision as never);
    expect(mockGetAlumnosByGithubUsernames.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpsertAlumnos.mock.invocationCallOrder[0]
    );
  });

  it("busca alumnos previos por githubUsername en batch", async () => {
    await importarAlumnosDeComision(comision as never);
    expect(mockGetAlumnosByGithubUsernames).toHaveBeenCalledWith(["Ana", "beto"]);
  });

  it("persiste los alumnos con la comisión incluida", async () => {
    await importarAlumnosDeComision(comision as never);
    expect(mockUpsertAlumnos).toHaveBeenCalledWith(
      alumnos.map((alumno) => ({ ...alumno, comision }))
    );
  });

  it("pasa emailPrevio al hook cuando el alumno ya existía", async () => {
    mockGetAlumnosByGithubUsernames.mockResolvedValue([
      { githubUsername: "ana", usernameCanonico: "ana", email: "ana-viejo@b.com" },
    ]);

    await importarAlumnosDeComision(comision as never);

    expect(mockEjecutarHooksPostConfirmacion).toHaveBeenCalledWith(
      expect.objectContaining({
        githubUsername: "Ana",
        email: "ana-nuevo@b.com",
        emailPrevio: "ana-viejo@b.com",
      }),
      ["google-groups-hook"]
    );
  });

  it("pasa emailPrevio undefined cuando el alumno no existía", async () => {
    await importarAlumnosDeComision(comision as never);

    expect(mockEjecutarHooksPostConfirmacion).toHaveBeenCalledWith(
      expect.objectContaining({
        githubUsername: "Ana",
        email: "ana-nuevo@b.com",
        emailPrevio: undefined,
      }),
      ["google-groups-hook"]
    );
  });

  it("cuenta conErrorDeGrupo cuando falla alguna suscripción", async () => {
    mockEjecutarHooksPostConfirmacion
      .mockResolvedValueOnce({ groupSubscription: "error" })
      .mockResolvedValueOnce({ groupSubscription: "added" });

    const result = await importarAlumnosDeComision(comision as never);

    expect(result).toEqual({ sincronizados: 2, conErrorDeGrupo: 1 });
  });

  it("no ejecuta sync de grupos inline", async () => {
    await importarAlumnosDeComision(comision as never);
    expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
  });

  it("envuelve errores de lectura de Sheets", async () => {
    mockGetAlumnos.mockRejectedValue(new Error("acceso denegado"));

    await expect(importarAlumnosDeComision(comision as never)).rejects.toThrow(
      LecturaPlanillaAlumnosError
    );
  });

  it("preserva el mensaje actual para errores de lectura de Sheets", async () => {
    mockGetAlumnos.mockRejectedValue(new Error("acceso denegado"));

    await expect(importarAlumnosDeComision(comision as never)).rejects.toThrow(
      "No se pudo leer la planilla: acceso denegado"
    );
  });

  it("no duplica el prefijo cuando getAlumnos ya incluye 'No se pudo leer la planilla'", async () => {
    mockGetAlumnos.mockRejectedValue(
      new Error("No se pudo leer la planilla de alumnos: timeout")
    );

    await expect(importarAlumnosDeComision(comision as never)).rejects.toThrow(
      "No se pudo leer la planilla de alumnos: timeout"
    );
    await expect(importarAlumnosDeComision(comision as never)).rejects.not.toThrow(
      "No se pudo leer la planilla: No se pudo leer la planilla"
    );
  });

  it("propaga errores de upsertAlumnos", async () => {
    const error = new Error("legajo duplicado");
    mockUpsertAlumnos.mockRejectedValue(error);

    await expect(importarAlumnosDeComision(comision as never)).rejects.toBe(error);
  });
});
