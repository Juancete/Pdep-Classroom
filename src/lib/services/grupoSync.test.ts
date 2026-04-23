import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GruposColumnConfig } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockGetAsignacionesGrupos = vi.fn();
const mockUpsertGrupoConMiembro = vi.fn();
const mockEmFindOne = vi.fn();
const mockEmFind = vi.fn();

vi.mock("@/lib/sheets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sheets")>("@/lib/sheets");
  return {
    ...actual,
    getAsignacionesGrupos: (...args: unknown[]) => mockGetAsignacionesGrupos(...args),
  };
});

vi.mock("@/lib/repositories", () => ({
  upsertGrupoConMiembro: (params: unknown) => mockUpsertGrupoConMiembro(params),
}));

vi.mock("@/lib/db", () => ({
  getEM: () => ({
    findOne: (...args: unknown[]) => mockEmFindOne(...args),
    find: (...args: unknown[]) => mockEmFind(...args),
  }),
}));

import { sincronizarGruposDelAlumno } from "./grupoSync";

// ── Helpers ──────────────────────────────────────────────────

const gruposConfig: GruposColumnConfig = {
  sheetName: "Alumnos",
  headerRows: 1,
  githubUsername: 3,
  nombreGrupoPorParadigma: { funcional: 5 },
};

const comisionConGrupos = {
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
    grupos: gruposConfig,
  },
} as unknown as Parameters<typeof sincronizarGruposDelAlumno>[1];

const comisionSinGrupos = {
  id: "c2",
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
} as unknown as Parameters<typeof sincronizarGruposDelAlumno>[1];

const alumnoFake = { id: "a1", githubUsername: "juangarcia" };
const grupalAssignmentFake = { id: "asg1", maxIntegrantes: 3, paradigma: "funcional" };

// ── Tests ────────────────────────────────────────────────────

describe("sincronizarGruposDelAlumno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAsignacionesGrupos.mockResolvedValue([]);
    mockEmFindOne.mockResolvedValue(alumnoFake);
    mockEmFind.mockResolvedValue([]);
    mockUpsertGrupoConMiembro.mockResolvedValue(undefined);
  });

  it("no hace nada si la comisión no tiene config de grupos", async () => {
    await sincronizarGruposDelAlumno("juangarcia", comisionSinGrupos);
    expect(mockGetAsignacionesGrupos).not.toHaveBeenCalled();
    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
  });

  it("no hace nada si la hoja no lista al alumno", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "otroalumno", paradigma: "funcional", nombreGrupo: "X" },
    ]);
    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos);
    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
  });

  it("no hace nada si no hay GrupalAssignment del paradigma todavía", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockEmFind.mockResolvedValue([]);
    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos);
    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
  });

  it("upsertea el grupo por cada GrupalAssignment del paradigma", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockEmFind.mockResolvedValue([
      grupalAssignmentFake,
      { ...grupalAssignmentFake, id: "asg2" },
    ]);

    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos);

    expect(mockUpsertGrupoConMiembro).toHaveBeenCalledTimes(2);
    expect(mockUpsertGrupoConMiembro).toHaveBeenCalledWith({
      nombreGrupo: "Los Lambdas",
      paradigma: "funcional",
      assignment: grupalAssignmentFake,
      alumno: alumnoFake,
    });
  });

  it("normaliza el githubUsername a lowercase al filtrar", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockEmFind.mockResolvedValue([grupalAssignmentFake]);

    await sincronizarGruposDelAlumno("JuanGarcia", comisionConGrupos);

    expect(mockUpsertGrupoConMiembro).toHaveBeenCalledTimes(1);
  });

  it("loguea y no throwea si getAsignacionesGrupos falla (evita abortar registro)", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation((() => {}) as never);
    mockGetAsignacionesGrupos.mockRejectedValue(new Error("Sheets caído"));

    await expect(
      sincronizarGruposDelAlumno("juangarcia", comisionConGrupos)
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("loguea y sigue si un upsert falla, sin abortar los otros", async () => {
    const { logger } = await import("@/lib/logger");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation((() => {}) as never);

    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockEmFind.mockResolvedValue([
      grupalAssignmentFake,
      { ...grupalAssignmentFake, id: "asg2" },
    ]);
    mockUpsertGrupoConMiembro
      .mockRejectedValueOnce(new Error("DB conflict"))
      .mockResolvedValueOnce(undefined);

    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos);

    expect(mockUpsertGrupoConMiembro).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });

  it("no hace nada si el alumno no está en DB (edge: borrado entre confirm y sync)", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockEmFindOne.mockResolvedValue(null);

    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos);

    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
  });
});
