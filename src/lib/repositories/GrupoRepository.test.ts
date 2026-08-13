import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import { TsMorphMetadataProvider } from "@mikro-orm/reflection";
import config from "../../../mikro-orm.config";

// ── Mocks ────────────────────────────────────────────────────
//
// Mockeo el EM completo: cada test arma respuestas de findOne/findOneOrFail
// según el caso. `transactional(cb)` simplemente invoca el callback con el
// mismo mock — el lock de transacción es responsabilidad de Postgres, acá
// solo se valida la lógica de validación + persistencia.
//
// Para que `new Grupo()` y `grupo.alumnos.add(...)` funcionen sin BD, el ORM
// se inicializa una sola vez con `connect: false` para que descubra los
// metadata de las entidades (mismo truco que `orm.test.ts`).

type MockTx = {
  findOne: ReturnType<typeof vi.fn>;
  findOneOrFail: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
};

const mockTx: MockTx = {
  findOne: vi.fn(),
  findOneOrFail: vi.fn(),
  persist: vi.fn(),
  flush: vi.fn(),
};

const mockEm = {
  ...mockTx,
  transactional: vi.fn(async (callback: (transaction: MockTx) => Promise<unknown>) => callback(mockTx)),
};

vi.mock("@/lib/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

// ── Imports después del mock ─────────────────────────────────

import { crearGrupo, unirseAGrupo } from "./GrupoRepository";
import {
  Grupo,
  Alumno,
  Comision,
  GrupalAssignment,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  GrupoLlenoError,
  AssignmentNoGrupalError,
} from "@/domain/entities";
import { IndividualAssignment } from "@/domain/entities/IndividualAssignment";
import type { Collection } from "@mikro-orm/core";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
} from "@/lib/services/assignmentAuthorization";

// ── Helpers ──────────────────────────────────────────────────

function fakeAlumno(id: string, githubUsername: string): Alumno {
  // Instancia real para que Collection<Alumno>.add() pase el `instanceof` check.
  const alumno = new Alumno();
  alumno.id = id;
  alumno.githubUsername = githubUsername;
  alumno.legajo = `leg-${id}`;
  alumno.nombre = githubUsername;
  alumno.apellido = "Test";
  alumno.email = `${githubUsername}@test`;
  alumno.comision = fakeComision();
  return alumno;
}

function fakeComision(id = "c1"): Comision {
  const comision = new Comision(2026, "sheet-test");
  comision.id = id;
  return comision;
}

function fakeGrupal(overrides: Partial<GrupalAssignment> = {}): GrupalAssignment {
  const grupal = new GrupalAssignment();
  grupal.id = "a1";
  grupal.paradigma = "funcional";
  grupal.maxIntegrantes = 3;
  grupal.inscripcionesCerradas = false;
  grupal.comision = fakeComision();
  Object.assign(grupal, overrides);
  return grupal;
}

function fakeGrupo(
  id: string,
  assignment: GrupalAssignment,
  miembros: Alumno[],
  maxIntegrantes = assignment.maxIntegrantes
): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = `grupo-${id}`;
  grupo.paradigma = assignment.paradigma;
  grupo.assignment = assignment;
  grupo.maxIntegrantes = maxIntegrantes;
  grupo.creadoPor = miembros[0]?.githubUsername ?? "alguien";
  const items: Alumno[] = [...miembros];
  grupo.alumnos = {
    contains: (alumno: Alumno) => items.some((member) => member.id === alumno.id),
    add: (alumno: Alumno) => items.push(alumno),
    get length() {
      return items.length;
    },
  } as unknown as Collection<Alumno>;
  return grupo;
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    ...config,
    metadataProvider: TsMorphMetadataProvider,
    connect: false,
  });
});

afterAll(async () => {
  await orm.close(true);
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEm.transactional.mockImplementation(
    async (callback: (transaction: MockTx) => Promise<unknown>) => callback(mockTx)
  );
});

// ── crearGrupo ──────────────────────────────────────────────

describe("crearGrupo", () => {
  it("crea el grupo con paradigma y maxIntegrantes del assignment, agrega al creador y persiste", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne
      .mockResolvedValueOnce(assignment) // Assignment lookup
      .mockResolvedValueOnce(null); // yaEnGrupo check
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    const grupo = await crearGrupo({
      assignmentId: "a1",
      alumnoId: "alumno-ana",
      nombre: "Los Lambdas",
      esAdmin: false,
    });

    expect(grupo.nombre).toBe("Los Lambdas");
    expect(grupo.paradigma).toBe("funcional");
    expect(grupo.maxIntegrantes).toBe(3);
    expect(grupo.assignment).toBe(assignment);
    expect(grupo.creadoPor).toBe("ana");
    expect(grupo.alumnos.contains(ana)).toBe(true);
    expect(mockTx.persist).toHaveBeenCalledWith(grupo);
    expect(mockTx.flush).toHaveBeenCalled();
  });

  it("lanza AssignmentNoEncontradoError si el assignment no existe", async () => {
    mockTx.findOne.mockResolvedValueOnce(null);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", esAdmin: false })
    ).rejects.toBeInstanceOf(AssignmentNoEncontradoError);
  });

  it("lanza AssignmentNoGrupalError si el assignment es individual", async () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    mockTx.findOne.mockResolvedValueOnce(individual);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", esAdmin: false })
    ).rejects.toBeInstanceOf(AssignmentNoGrupalError);
  });

  it("lanza InscripcionesCerradasError si el docente cerró las inscripciones", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(fakeGrupal({ inscripcionesCerradas: true }));
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", esAdmin: false })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);
  });

  it("lanza AlumnoYaEnGrupoDelAssignmentError si el alumno ya está en otro grupo del mismo assignment", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoExistente = fakeGrupo("g-otro", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce(grupoExistente);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", esAdmin: false })
    ).rejects.toBeInstanceOf(AlumnoYaEnGrupoDelAssignmentError);
    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("rechaza dentro de la transacción a un alumno de otra comisión", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    mockTx.findOne.mockResolvedValueOnce(assignment);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: "x",
        esAdmin: false,
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);

    expect(mockEm.transactional).toHaveBeenCalledTimes(1);
    expect(mockTx.persist).not.toHaveBeenCalled();
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("permite crear entre comisiones cuando el contexto es administrador", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    mockTx.findOne
      .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce(null);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: "x",
        esAdmin: true,
      })
    ).resolves.toBeInstanceOf(Grupo);
  });
});

// ── unirseAGrupo ────────────────────────────────────────────

describe("unirseAGrupo", () => {
  it("rechaza con 404 lógico si el grupo no pertenece al assignment de la URL", async () => {
    mockTx.findOne.mockResolvedValueOnce(null);

    await expect(
      unirseAGrupo({
        assignmentId: "a-otro",
        grupoId: "g1",
        alumnoId: "alumno-ana",
        esAdmin: false,
      })
    ).rejects.toBeInstanceOf(GrupoNoEncontradoError);

    expect(mockTx.findOneOrFail).not.toHaveBeenCalled();
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("happy path: suma al alumno y flushea", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo) // Grupo
      .mockResolvedValueOnce(null); // enOtroGrupo
    mockTx.findOneOrFail.mockResolvedValueOnce(ana); // Alumno

    const resultado = await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", esAdmin: false });

    expect(resultado).toBe(grupo);
    expect(mockTx.findOne).toHaveBeenNthCalledWith(
      1,
      Grupo,
      { id: "g1", assignment: { id: "a1" } },
      { populate: ["alumnos", "assignment.comision"] }
    );
    expect(grupo.alumnos.contains(ana)).toBe(true);
    expect(mockTx.flush).toHaveBeenCalled();
  });

  it("idempotente: si el alumno ya es miembro del grupo, retorna el grupo sin error y sin flush", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne.mockResolvedValueOnce(grupo);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    const resultado = await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", esAdmin: false });

    expect(resultado).toBe(grupo);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("lanza InscripcionesCerradasError cuando el docente cerró el assignment", async () => {
    const assignment = fakeGrupal({ inscripcionesCerradas: true });
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne.mockResolvedValueOnce(grupo);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", esAdmin: false })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);
  });

  it("lanza AlumnoYaEnGrupoDelAssignmentError si el alumno ya está en otro grupo", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDestino = fakeGrupo("g1", assignment, []);
    const grupoOtro = fakeGrupo("g-otro", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupoDestino)
      .mockResolvedValueOnce(grupoOtro);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", esAdmin: false })
    ).rejects.toBeInstanceOf(AlumnoYaEnGrupoDelAssignmentError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("propaga GrupoLlenoError cuando el grupo está al máximo (race del último cupo)", async () => {
    const assignment = fakeGrupal({ maxIntegrantes: 2 });
    const ana = fakeAlumno("alumno-ana", "ana");
    const bob = fakeAlumno("alumno-bob", "bob");
    const cora = fakeAlumno("alumno-cora", "cora");
    const grupoLleno = fakeGrupo("g1", assignment, [ana, bob]);
    mockTx.findOne
      .mockResolvedValueOnce(grupoLleno)
      .mockResolvedValueOnce(null);
    mockTx.findOneOrFail.mockResolvedValueOnce(cora);

    await expect(
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-cora", esAdmin: false })
    ).rejects.toBeInstanceOf(GrupoLlenoError);
  });

  it("toda la operación corre dentro de em.transactional para resolver races", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", esAdmin: false });

    expect(mockEm.transactional).toHaveBeenCalledTimes(1);
  });

  it("rechaza dentro de la transacción a un alumno de otra comisión", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne.mockResolvedValueOnce(grupo);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        alumnoId: "alumno-ana",
        esAdmin: false,
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);

    expect(mockEm.transactional).toHaveBeenCalledTimes(1);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("permite unirse entre comisiones cuando el contexto es administrador", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        alumnoId: "alumno-ana",
        esAdmin: true,
      })
    ).resolves.toBe(grupo);

    expect(mockTx.flush).toHaveBeenCalled();
  });
});
