import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Comision,
  GrupalAssignment,
  IndividualAssignment,
  AssignmentNoEncontradoError,
  AssignmentNoGrupalError,
  type Grupo,
} from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetAssignment = vi.fn();
const mockGetAlumnosByComision = vi.fn();
const mockGetGruposDeAssignment = vi.fn();
const mockEscribirColumnaDeGrupoEnSheets = vi.fn();

vi.mock("@/infrastructure/repositories", () => ({
  getAssignment: (id: string) => mockGetAssignment(id),
  getAlumnosByComision: (comisionId: string) => mockGetAlumnosByComision(comisionId),
  getGruposDeAssignment: (assignmentId: string) => mockGetGruposDeAssignment(assignmentId),
}));

vi.mock("@/infrastructure/sheets", () => ({
  escribirColumnaDeGrupoEnSheets: (...args: unknown[]) =>
    mockEscribirColumnaDeGrupoEnSheets(...args),
}));

import {
  volcarGruposAPlanilla,
  ColumnaDeGrupoNoConfiguradaError,
  AssignmentSinComisionError,
  ColumnaDeGrupoOcupadaPorDatosPersonalesError,
} from "./volcarGruposAPlanilla";

// ── Helpers ──────────────────────────────────────────────────

function fakeComision(overrides: Partial<Comision> = {}): Comision {
  const comision = new Comision(2026, "sheet-1");
  return Object.assign(comision, overrides);
}

function fakeGrupal(overrides: {
  columna?: number;
  comision?: Comision;
} = {}): GrupalAssignment {
  const grupal = new GrupalAssignment();
  grupal.id = "a1";
  grupal.maxIntegrantes = 4;
  grupal.columnaGrupoEnPlanilla = overrides.columna;
  grupal.comision = overrides.comision;
  return grupal;
}

function fakeAlumno(username: string): { githubUsername: string } {
  return { githubUsername: username };
}

// Duck-typed a propósito (mismo criterio que `fakeGrupo` en
// `Assignment.test.ts`): `volcarGruposAPlanilla` sólo usa
// `admiteIntegrantesDe`, `usernamesDeMiembros` y `nombre`.
function fakeGrupo(
  nombre: string,
  usernames: string[],
  tipoDeIntegrantes: "alumnos" | "docentes" = "alumnos"
): Grupo {
  return {
    nombre,
    admiteIntegrantesDe: (tipo: string) => tipo === tipoDeIntegrantes,
    usernamesDeMiembros: () => usernames,
  } as unknown as Grupo;
}

// ── Tests ────────────────────────────────────────────────────

describe("volcarGruposAPlanilla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAlumnosByComision.mockResolvedValue([]);
    mockGetGruposDeAssignment.mockResolvedValue([]);
    mockEscribirColumnaDeGrupoEnSheets.mockResolvedValue({ alumnosEscritos: 0, sinFila: [] });
  });

  it("lanza AssignmentNoEncontradoError si el assignment no existe", async () => {
    mockGetAssignment.mockResolvedValue(null);

    await expect(volcarGruposAPlanilla("a1")).rejects.toBeInstanceOf(
      AssignmentNoEncontradoError
    );
    expect(mockGetAlumnosByComision).not.toHaveBeenCalled();
    expect(mockEscribirColumnaDeGrupoEnSheets).not.toHaveBeenCalled();
  });

  it("lanza AssignmentNoGrupalError si el assignment no es grupal", async () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    mockGetAssignment.mockResolvedValue(individual);

    await expect(volcarGruposAPlanilla("a1")).rejects.toBeInstanceOf(AssignmentNoGrupalError);
    expect(mockGetAlumnosByComision).not.toHaveBeenCalled();
  });

  it("lanza ColumnaDeGrupoNoConfiguradaError si el grupal no tiene columna configurada", async () => {
    const grupal = fakeGrupal({ comision: fakeComision() });
    mockGetAssignment.mockResolvedValue(grupal);

    await expect(volcarGruposAPlanilla("a1")).rejects.toBeInstanceOf(
      ColumnaDeGrupoNoConfiguradaError
    );
    expect(mockGetAlumnosByComision).not.toHaveBeenCalled();
    expect(mockEscribirColumnaDeGrupoEnSheets).not.toHaveBeenCalled();
  });

  it("lanza AssignmentSinComisionError si el assignment no tiene comisión", async () => {
    const grupal = fakeGrupal({ columna: 5, comision: undefined });
    mockGetAssignment.mockResolvedValue(grupal);

    await expect(volcarGruposAPlanilla("a1")).rejects.toBeInstanceOf(
      AssignmentSinComisionError
    );
    expect(mockGetAlumnosByComision).not.toHaveBeenCalled();
    expect(mockEscribirColumnaDeGrupoEnSheets).not.toHaveBeenCalled();
  });

  it("lanza ColumnaDeGrupoOcupadaPorDatosPersonalesError si la columna configurada quedó ocupada por un dato personal", async () => {
    const comision = fakeComision({
      columnaOcupadaPorDatosPersonales: () => true,
    });
    mockGetAssignment.mockResolvedValue(fakeGrupal({ columna: 5, comision }));

    await expect(volcarGruposAPlanilla("a1")).rejects.toBeInstanceOf(
      ColumnaDeGrupoOcupadaPorDatosPersonalesError
    );
    expect(mockGetAlumnosByComision).not.toHaveBeenCalled();
    expect(mockGetGruposDeAssignment).not.toHaveBeenCalled();
    expect(mockEscribirColumnaDeGrupoEnSheets).not.toHaveBeenCalled();
  });

  it("excluye los grupos de docentes al armar el mapa de nombres", async () => {
    const comision = fakeComision();
    mockGetAssignment.mockResolvedValue(fakeGrupal({ columna: 5, comision }));
    mockGetAlumnosByComision.mockResolvedValue([fakeAlumno("ana"), fakeAlumno("profe")]);
    mockGetGruposDeAssignment.mockResolvedValue([
      fakeGrupo("Los Lambdas", ["ana"], "alumnos"),
      fakeGrupo("Demo Docentes", ["profe"], "docentes"),
    ]);

    await volcarGruposAPlanilla("a1");

    const nombreGrupoPorUsername = mockEscribirColumnaDeGrupoEnSheets.mock.calls[0]![3];
    expect(nombreGrupoPorUsername).toEqual(new Map([["ana", "Los Lambdas"]]));
  });

  it("incluye a los alumnos sin grupo en la lista de usernames (para que queden vacíos)", async () => {
    const comision = fakeComision();
    mockGetAssignment.mockResolvedValue(fakeGrupal({ columna: 5, comision }));
    mockGetAlumnosByComision.mockResolvedValue([fakeAlumno("ana"), fakeAlumno("bob")]);
    mockGetGruposDeAssignment.mockResolvedValue([fakeGrupo("Los Lambdas", ["ana"])]);

    await volcarGruposAPlanilla("a1");

    const usernames = mockEscribirColumnaDeGrupoEnSheets.mock.calls[0]![4];
    expect(usernames).toEqual(["ana", "bob"]);
  });

  it("pasa spreadsheetId, columnConfig y la columna configurada a escribirColumnaDeGrupoEnSheets", async () => {
    const comision = fakeComision({ spreadsheetId: "sheet-xyz" });
    mockGetAssignment.mockResolvedValue(fakeGrupal({ columna: 5, comision }));

    await volcarGruposAPlanilla("a1");

    expect(mockEscribirColumnaDeGrupoEnSheets).toHaveBeenCalledWith(
      "sheet-xyz",
      comision.columnConfig,
      5,
      expect.any(Map),
      []
    );
  });

  it("devuelve el resultado de escribirColumnaDeGrupoEnSheets", async () => {
    mockGetAssignment.mockResolvedValue(fakeGrupal({ columna: 5, comision: fakeComision() }));
    mockEscribirColumnaDeGrupoEnSheets.mockResolvedValue({
      alumnosEscritos: 3,
      sinFila: ["forastero"],
    });

    const result = await volcarGruposAPlanilla("a1");

    expect(result).toEqual({ alumnosEscritos: 3, sinFila: ["forastero"] });
  });

  it("propaga el error si escribirColumnaDeGrupoEnSheets falla (sin tragar)", async () => {
    mockGetAssignment.mockResolvedValue(fakeGrupal({ columna: 5, comision: fakeComision() }));
    mockEscribirColumnaDeGrupoEnSheets.mockRejectedValue(new Error("Sheets caído"));

    await expect(volcarGruposAPlanilla("a1")).rejects.toThrow("Sheets caído");
  });
});
