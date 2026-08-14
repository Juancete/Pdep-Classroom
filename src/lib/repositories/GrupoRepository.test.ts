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
  populate: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
};

const mockTx: MockTx = {
  findOne: vi.fn(),
  findOneOrFail: vi.fn(),
  populate: vi.fn(),
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

import {
  crearGrupo,
  unirseAGrupo,
  upsertGrupoConMiembro,
} from "./GrupoRepository";
import { getEM } from "@/lib/db";
import {
  Grupo,
  Alumno,
  Comision,
  GrupalAssignment,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
  GrupoLlenoError,
  AssignmentNoGrupalError,
} from "@/domain/entities";
import { IndividualAssignment } from "@/domain/entities/IndividualAssignment";
import { LockMode, type Collection } from "@mikro-orm/core";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
} from "@/lib/services/assignmentAuthorization";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";

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
  grupal.slug = "tp-funcional";
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
  grupo.nombreNormalizado = `grupo-${id}`;
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

function uniqueMembershipError(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "grupo_alumnos_assignment_alumno_unique_idx"'
    ),
    { code: "23505" }
  );
}

function uniqueGroupNameError(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "grupo_assignment_nombre_normalizado_unique_idx"'
    ),
    { code: "23505" }
  );
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
      nombre: "  Los Lógicos ++  ",
      esAdmin: false,
    });

    expect(grupo.nombre).toBe("Los Lógicos ++");
    expect(grupo.nombreNormalizado).toBe("los-logicos");
    expect(grupo.paradigma).toBe("funcional");
    expect(grupo.maxIntegrantes).toBe(3);
    expect(grupo.assignment).toBe(assignment);
    expect(grupo.creadoPor).toBe("ana");
    expect(grupo.alumnos.contains(ana)).toBe(true);
    expect(mockTx.persist).toHaveBeenCalledWith(grupo);
    expect(mockTx.flush).toHaveBeenCalled();
  });

  it("rechaza un nombre que queda vacío después de normalizar", async () => {
    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: " +++ ",
        esAdmin: false,
      })
    ).rejects.toBeInstanceOf(NombreGrupoInvalidoError);

    expect(getEM).not.toHaveBeenCalled();
  });

  it("rechaza un nombre que haría superar el límite del repositorio", async () => {
    mockTx.findOne.mockResolvedValueOnce(
      fakeGrupal({ slug: "a".repeat(90) })
    );

    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: "b".repeat(10),
        esAdmin: false,
      })
    ).rejects.toBeInstanceOf(NombreRepositorioDemasiadoLargoError);

    expect(mockTx.findOneOrFail).not.toHaveBeenCalled();
    expect(mockTx.persist).not.toHaveBeenCalled();
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

  it("traduce el conflicto concurrente de inscripción única", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne
      .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce(null);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.flush.mockRejectedValueOnce(uniqueMembershipError());

    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: "Los Lambdas",
        esAdmin: false,
      })
    ).rejects.toMatchObject({
      constructor: AlumnoYaEnGrupoDelAssignmentError,
      assignmentId: "a1",
      githubUsername: "ana",
    });
  });

  it("traduce el conflicto concurrente por nombre de grupo duplicado", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne
      .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce(null);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.flush.mockRejectedValueOnce(uniqueGroupNameError());

    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: "Los Lambdas",
        esAdmin: false,
      })
    ).rejects.toMatchObject({
      constructor: NombreGrupoDuplicadoError,
      assignmentId: "a1",
      nombre: "Los Lambdas",
    });
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
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    expect(mockTx.populate).toHaveBeenCalledWith(
      grupo,
      ["alumnos", "assignment.comision"],
      { refresh: true }
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

  it("traduce el conflicto concurrente al unirse a dos grupos", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.flush.mockRejectedValueOnce(uniqueMembershipError());

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        alumnoId: "alumno-ana",
        esAdmin: false,
      })
    ).rejects.toMatchObject({
      constructor: AlumnoYaEnGrupoDelAssignmentError,
      assignmentId: "a1",
      githubUsername: "ana",
    });
  });
});

describe("upsertGrupoConMiembro", () => {
  it("rechaza antes de persistir un nombre de Sheets que supera el límite del repositorio", async () => {
    const assignment = fakeGrupal({ slug: "a".repeat(90) });
    const ana = fakeAlumno("alumno-ana", "ana");

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: "b".repeat(10),
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).rejects.toBeInstanceOf(NombreRepositorioDemasiadoLargoError);

    expect(getEM).not.toHaveBeenCalled();
    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("bloquea el grupo, valida las invariantes y agrega al alumno", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    const result = await upsertGrupoConMiembro({
      nombreGrupo: grupo.nombre,
      paradigma: "funcional",
      assignment,
      alumno: ana,
    });

    expect(result).toBe(grupo);
    expect(mockTx.findOne).toHaveBeenNthCalledWith(
      1,
      Grupo,
      {
        nombreNormalizado: grupo.nombreNormalizado,
        assignment: { id: "a1" },
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    expect(mockTx.populate).toHaveBeenCalledWith(
      grupo,
      ["alumnos"],
      { refresh: true }
    );
    expect(grupo.alumnos.contains(ana)).toBe(true);
    expect(mockTx.flush).toHaveBeenCalled();
  });

  it("rechaza un alumno que ya pertenece a otro grupo del assignment", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const destino = fakeGrupo("g1", assignment, []);
    const otro = fakeGrupo("g2", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(destino)
      .mockResolvedValueOnce(otro);

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: destino.nombre,
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).rejects.toBeInstanceOf(AlumnoYaEnGrupoDelAssignmentError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("respeta el cupo del grupo al sincronizar desde Sheets", async () => {
    const assignment = fakeGrupal({ maxIntegrantes: 1 });
    const ana = fakeAlumno("alumno-ana", "ana");
    const bob = fakeAlumno("alumno-bob", "bob");
    const lleno = fakeGrupo("g1", assignment, [bob], 1);
    mockTx.findOne
      .mockResolvedValueOnce(lleno)
      .mockResolvedValueOnce(null);

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: lleno.nombre,
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).rejects.toBeInstanceOf(GrupoLlenoError);
  });

  it("traduce la restricción única si otra transacción gana la carrera", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);
    mockTx.flush.mockRejectedValueOnce(uniqueMembershipError());

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: grupo.nombre,
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).rejects.toBeInstanceOf(AlumnoYaEnGrupoDelAssignmentError);
  });

  it("reintenta con un EM nuevo si otra transacción crea el mismo grupo", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const ganador = fakeGrupo("g-ganador", assignment, []);
    ganador.nombre = "Los Lambdas";
    ganador.nombreNormalizado = "los-lambdas";
    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(ganador)
      .mockResolvedValueOnce(null);
    mockTx.flush.mockRejectedValueOnce(uniqueGroupNameError());

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: "Los Lambdas",
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).resolves.toBe(ganador);

    expect(getEM).toHaveBeenCalledTimes(2);
    expect(mockEm.transactional).toHaveBeenCalledTimes(2);
    expect(mockTx.populate).toHaveBeenCalledWith(
      ganador,
      ["alumnos"],
      { refresh: true }
    );
    expect(ganador.alumnos.contains(ana)).toBe(true);
  });

  it("rechaza nombres distintos que generan el mismo identificador", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const existente = fakeGrupo("g1", assignment, []);
    existente.nombre = "Los Lógicos";
    existente.nombreNormalizado = "los-logicos";
    mockTx.findOne.mockResolvedValueOnce(existente);

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: "Los Logicos!",
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).rejects.toBeInstanceOf(NombreGrupoDuplicadoError);

    expect(mockTx.populate).not.toHaveBeenCalled();
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("devuelve un conflicto explícito si el reintento también colisiona", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValue(null);
    mockTx.flush.mockRejectedValue(uniqueGroupNameError());

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: "Los Lambdas",
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).rejects.toMatchObject({
      constructor: NombreGrupoDuplicadoError,
      assignmentId: "a1",
      nombre: "Los Lambdas",
    });

    expect(getEM).toHaveBeenCalledTimes(2);
  });
});
