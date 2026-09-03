import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GruposColumnConfig } from "@/types";

// ── Mocks ────────────────────────────────────────────────────

const mockGetAsignacionesGrupos = vi.fn();
const mockUpsertGrupoConMiembro = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetGrupalAssignmentsDeComisionYParadigma = vi.fn();

vi.mock("@/infrastructure/sheets", async () => {
  const actual = await vi.importActual<typeof import("@/infrastructure/sheets")>("@/infrastructure/sheets");
  return {
    ...actual,
    getAsignacionesGrupos: (...args: unknown[]) => mockGetAsignacionesGrupos(...args),
  };
});

vi.mock("@/infrastructure/repositories", () => ({
  upsertGrupoConMiembro: (params: unknown) => mockUpsertGrupoConMiembro(params),
  getAlumnoByGithub: (githubUsername: string) => mockGetAlumnoByGithub(githubUsername),
  getGrupalAssignmentsDeComisionYParadigma: (comisionId: string, paradigma: string) =>
    mockGetGrupalAssignmentsDeComisionYParadigma(comisionId, paradigma),
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
  gruposConfig: () => gruposConfig,
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
  gruposConfig: () => undefined,
} as unknown as Parameters<typeof sincronizarGruposDelAlumno>[1];

const alumnoFake = { id: "a1", githubUsername: "juangarcia" };
const grupalAssignmentFake = { id: "asg1", maxIntegrantes: 3, paradigma: "funcional" };

// ── Tests ────────────────────────────────────────────────────

describe("sincronizarGruposDelAlumno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAsignacionesGrupos.mockResolvedValue([]);
    mockGetAlumnoByGithub.mockResolvedValue(alumnoFake);
    mockGetGrupalAssignmentsDeComisionYParadigma.mockResolvedValue([]);
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
    mockGetGrupalAssignmentsDeComisionYParadigma.mockResolvedValue([]);
    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos);
    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
  });

  it("upsertea el grupo por cada GrupalAssignment del paradigma", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockGetGrupalAssignmentsDeComisionYParadigma.mockResolvedValue([
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
    mockGetGrupalAssignmentsDeComisionYParadigma.mockResolvedValue([grupalAssignmentFake]);

    await sincronizarGruposDelAlumno("JuanGarcia", comisionConGrupos);

    expect(mockUpsertGrupoConMiembro).toHaveBeenCalledTimes(1);
  });

  it("propaga el error si getAsignacionesGrupos falla (el caller decide qué mostrar)", async () => {
    mockGetAsignacionesGrupos.mockRejectedValue(new Error("Sheets caído"));

    await expect(
      sincronizarGruposDelAlumno("juangarcia", comisionConGrupos)
    ).rejects.toThrow("Sheets caído");

    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
  });

  it("propaga el error si un upsert falla (sin tragar)", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockGetGrupalAssignmentsDeComisionYParadigma.mockResolvedValue([grupalAssignmentFake]);
    mockUpsertGrupoConMiembro.mockRejectedValue(new Error("DB conflict"));

    await expect(
      sincronizarGruposDelAlumno("juangarcia", comisionConGrupos)
    ).rejects.toThrow("DB conflict");
  });

  it("reutiliza asignacionesPrefetched y no vuelve a leer la hoja", async () => {
    const prefetched = [
      { githubUsername: "juangarcia", paradigma: "funcional" as const, nombreGrupo: "Los Lambdas" },
    ];
    mockGetGrupalAssignmentsDeComisionYParadigma.mockResolvedValue([grupalAssignmentFake]);

    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos, prefetched);

    expect(mockGetAsignacionesGrupos).not.toHaveBeenCalled();
    expect(mockUpsertGrupoConMiembro).toHaveBeenCalledTimes(1);
    expect(mockUpsertGrupoConMiembro).toHaveBeenCalledWith({
      nombreGrupo: "Los Lambdas",
      paradigma: "funcional",
      assignment: grupalAssignmentFake,
      alumno: alumnoFake,
    });
  });

  it("no hace nada si el alumno no está en DB (edge: borrado entre confirm y sync)", async () => {
    mockGetAsignacionesGrupos.mockResolvedValue([
      { githubUsername: "juangarcia", paradigma: "funcional", nombreGrupo: "Los Lambdas" },
    ]);
    mockGetAlumnoByGithub.mockResolvedValue(null);

    await sincronizarGruposDelAlumno("juangarcia", comisionConGrupos);

    expect(mockUpsertGrupoConMiembro).not.toHaveBeenCalled();
  });
});
