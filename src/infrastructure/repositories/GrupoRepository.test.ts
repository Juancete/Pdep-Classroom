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
  remove: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  // `execute`, no `getConnection().execute`: este último no hereda el
  // contexto de transacción activo en MikroORM (ver GrupoRepository.ts,
  // lockearMembresia) — el mock imita la API que el código real usa.
  execute: ReturnType<typeof vi.fn>;
};

const mockTx: MockTx = {
  findOne: vi.fn(),
  findOneOrFail: vi.fn(),
  populate: vi.fn(),
  persist: vi.fn(),
  remove: vi.fn(),
  flush: vi.fn(),
  execute: vi.fn(),
};

const mockEm = {
  ...mockTx,
  transactional: vi.fn(async (callback: (transaction: MockTx) => Promise<unknown>) => callback(mockTx)),
};

vi.mock("@/infrastructure/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

// ── Imports después del mock ─────────────────────────────────

import {
  crearGrupo,
  unirseAGrupo,
  upsertGrupoConMiembro,
  salirDeGrupo,
  moverAlumnoDeGrupo,
} from "./GrupoRepository";
import { getEM } from "@/infrastructure/db";
import {
  Grupo,
  Alumno,
  Comision,
  Entrega,
  GrupalAssignment,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
  GrupoLlenoError,
  AssignmentNoGrupalError,
  AlumnoNoEsMiembroDelGrupoError,
  GrupoConEntregaError,
  DOCENTE,
  ESTUDIANTE,
} from "@/domain/entities";
import type { PdepUser } from "@/types";
import { IndividualAssignment } from "@/domain/entities/IndividualAssignment";
import { LockMode, type Collection } from "@mikro-orm/core";
import {
  AccesoAssignmentProhibidoError,
  AssignmentNoDisponibleError,
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
} from "@/application/assignmentAuthorization";
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
  // Publicado por defecto: crear/unirse a grupo requiere que el assignment
  // esté disponible para el alumno. Los tests de ciclo de vida overridean
  // `estadoNombre` explícitamente.
  grupal.transicionarA("publicado", { tieneEntregas: false }, "docente1");
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
    remove: (alumno: Alumno) => {
      const index = items.findIndex((member) => member.id === alumno.id);
      if (index !== -1) items.splice(index, 1);
    },
    getItems: () => items,
    get length() {
      return items.length;
    },
  } as unknown as Collection<Alumno>;
  return grupo;
}

function fakeUsuario(githubUsername: string, rol = ESTUDIANTE): PdepUser {
  return { githubUsername, name: githubUsername, image: "", rol };
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
      rol: ESTUDIANTE,
    });

    expect(grupo.nombre).toBe("Los Lógicos ++");
    expect(grupo.nombreNormalizado).toBe("los-logicos");
    expect(grupo.paradigma).toBe("funcional");
    expect(grupo.maxIntegrantes).toBe(3);
    expect(grupo.assignment).toBe(assignment);
    expect(grupo.creadoPor).toBe("ana");
    expect(grupo.alumnos.contains(ana)).toBe(true);
    expect(mockTx.persist).toHaveBeenCalledWith(grupo);
    expect(mockTx.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "alta",
        origen: "alumno",
        alumnoId: "alumno-ana",
        grupoDestinoId: grupo.id,
        realizadoPor: "ana",
      })
    );
    expect(mockTx.flush).toHaveBeenCalled();
  });

  // Fase 3 de la auditoría de dominio: la validación de nombre/longitud
  // ahora vive en `GrupalAssignment.crearGrupo` (única fuente, compartida
  // con `upsertGrupoConMiembro`) y se ejecuta recién después de cargar el
  // assignment y al alumno — antes fallaba sin tocar la DB, ahora falla
  // sin persistir nada (mismo resultado observable para quien llama).
  it("rechaza un nombre que queda vacío después de normalizar", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(fakeGrupal());
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: " +++ ",
        rol: ESTUDIANTE,
      })
    ).rejects.toBeInstanceOf(NombreGrupoInvalidoError);

    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("rechaza un nombre que haría superar el límite del repositorio", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(
      fakeGrupal({ slug: "a".repeat(90) })
    );
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        nombre: "b".repeat(10),
        rol: ESTUDIANTE,
      })
    ).rejects.toBeInstanceOf(NombreRepositorioDemasiadoLargoError);

    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("lanza AssignmentNoEncontradoError si el assignment no existe", async () => {
    mockTx.findOne.mockResolvedValueOnce(null);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", rol: ESTUDIANTE })
    ).rejects.toBeInstanceOf(AssignmentNoEncontradoError);
  });

  it("lanza AssignmentNoGrupalError si el assignment es individual", async () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    mockTx.findOne.mockResolvedValueOnce(individual);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", rol: ESTUDIANTE })
    ).rejects.toBeInstanceOf(AssignmentNoGrupalError);
  });

  it("lanza InscripcionesCerradasError si el docente cerró las inscripciones", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(fakeGrupal({ inscripcionesCerradas: true }));
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", rol: ESTUDIANTE })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);
  });

  // B3: antes este chequeo era `assignment.aceptaNuevasInscripciones()`
  // directo, sin pasar por el rol — asimétrico con `salirDeGrupo`/
  // `moverAlumnoDeGrupo`, que sí delegan en `RolDeUsuario.autorizarCambioDeMembresia`.
  // Un docente resuelve siempre (ver `Docente.autorizarCambioDeMembresia`).
  it("permite al docente crear un grupo aunque las inscripciones estén cerradas (B3)", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne
      .mockResolvedValueOnce(fakeGrupal({ inscripcionesCerradas: true })) // Assignment lookup
      .mockResolvedValueOnce(null); // yaEnGrupo check
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    const grupo = await crearGrupo({
      assignmentId: "a1",
      alumnoId: "alumno-ana",
      nombre: "Los Lógicos",
      rol: DOCENTE,
    });

    expect(grupo.alumnos.contains(ana)).toBe(true);
    expect(mockTx.flush).toHaveBeenCalled();
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
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", rol: ESTUDIANTE })
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
        rol: ESTUDIANTE,
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);

    expect(mockEm.transactional).toHaveBeenCalledTimes(1);
    expect(mockTx.persist).not.toHaveBeenCalled();
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("rechaza crear grupo en un assignment que no está publicado", async () => {
    const borrador = fakeGrupal();
    borrador.estadoNombre = "borrador";
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(borrador);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      crearGrupo({ assignmentId: "a1", alumnoId: "alumno-ana", nombre: "x", rol: ESTUDIANTE })
    ).rejects.toBeInstanceOf(AssignmentNoDisponibleError);
    expect(mockTx.persist).not.toHaveBeenCalled();
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
        rol: DOCENTE,
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
        rol: ESTUDIANTE,
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
        rol: ESTUDIANTE,
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
        usuario: fakeUsuario("ana"),
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

    const resultado = await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", usuario: fakeUsuario("ana") });

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
    expect(mockTx.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "alta",
        origen: "alumno",
        alumnoId: "alumno-ana",
        grupoDestinoId: "g1",
        realizadoPor: "ana",
      })
    );
    expect(mockTx.flush).toHaveBeenCalled();
  });

  it("idempotente: si el alumno ya es miembro del grupo, retorna el grupo sin error y sin flush", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne.mockResolvedValueOnce(grupo);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    const resultado = await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", usuario: fakeUsuario("ana") });

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
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", usuario: fakeUsuario("ana") })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);
  });

  // B3: mismo criterio que en `crearGrupo` — un docente puede sumar un
  // integrante a un grupo aunque las inscripciones estén cerradas.
  it("permite al docente sumar un alumno aunque las inscripciones estén cerradas (B3)", async () => {
    const assignment = fakeGrupal({ inscripcionesCerradas: true });
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo) // Grupo
      .mockResolvedValueOnce(null); // enOtroGrupo
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    const resultado = await unirseAGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      alumnoId: "alumno-ana",
      usuario: fakeUsuario("docente1", DOCENTE),
    });

    expect(resultado).toBe(grupo);
    expect(grupo.alumnos.contains(ana)).toBe(true);
    expect(mockTx.flush).toHaveBeenCalled();
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
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", usuario: fakeUsuario("ana") })
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
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-cora", usuario: fakeUsuario("cora") })
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

    await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", alumnoId: "alumno-ana", usuario: fakeUsuario("ana") });

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
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);

    expect(mockEm.transactional).toHaveBeenCalledTimes(1);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("rechaza unirse a un grupo de un assignment archivado", async () => {
    const archivado = fakeGrupal();
    archivado.transicionarA("archivado", { tieneEntregas: false }, "docente1");
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", archivado, []);
    mockTx.findOne.mockResolvedValueOnce(grupo);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        alumnoId: "alumno-ana",
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(AssignmentNoDisponibleError);
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
        usuario: fakeUsuario("ana", DOCENTE),
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
        usuario: fakeUsuario("ana"),
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
    // El código reintenta con un EM nuevo tras la primera colisión (dos
    // transacciones ⇒ dos findOne/flush). Se dejan "once" y no permanentes
    // para no contaminar los tests que corren después en este archivo.
    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockTx.flush
      .mockRejectedValueOnce(uniqueGroupNameError())
      .mockRejectedValueOnce(uniqueGroupNameError());

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

// ── salirDeGrupo ────────────────────────────────────────────

describe("salirDeGrupo", () => {
  it("quita al alumno, flushea y no borra el grupo si no queda vacío", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const bob = fakeAlumno("alumno-bob", "bob");
    const grupo = fakeGrupo("g1", assignment, [ana, bob]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupo) // lock del grupo
      .mockResolvedValueOnce(null); // sin entrega

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(resultado).toEqual({ grupo, grupoEliminado: false });
    expect(grupo.alumnos.contains(ana)).toBe(false);
    expect(grupo.alumnos.contains(bob)).toBe(true);
    expect(mockTx.remove).not.toHaveBeenCalled();
    expect(mockTx.flush).toHaveBeenCalled();
    expect(mockTx.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: "baja",
        origen: "alumno",
        assignmentId: "a1",
        alumnoId: "alumno-ana",
        grupoOrigenId: "g1",
        grupoOrigenTeniaEntrega: false,
        grupoOrigenEliminado: false,
      })
    );
  });

  it("lanza GrupoNoEncontradoError si el grupo no pertenece al assignment", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne.mockResolvedValueOnce(null);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(GrupoNoEncontradoError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("lanza AlumnoNoEsMiembroDelGrupoError si el alumno no está en el grupo", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [fakeAlumno("alumno-bob", "bob")]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne.mockResolvedValueOnce(grupo);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(AlumnoNoEsMiembroDelGrupoError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("rechaza al alumno con inscripciones cerradas, pero permite al docente", async () => {
    const assignment = fakeGrupal({ inscripcionesCerradas: true });
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoParaAlumno = fakeGrupo("g1", assignment, [ana, fakeAlumno("alumno-bob", "bob")]);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoParaAlumno)
      .mockResolvedValueOnce(null);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);

    const grupoParaDocente = fakeGrupo("g1", assignment, [ana, fakeAlumno("alumno-bob", "bob")]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoParaDocente)
      .mockResolvedValueOnce(null);

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      usuario: fakeUsuario("ana", DOCENTE),
    });
    expect(resultado.grupo).toBe(grupoParaDocente);
  });

  it("rechaza al alumno si el grupo ya entregó, y no lo borra aunque quede vacío para el docente", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const entregaFake = Object.assign(new Entrega(), { id: "e1" });

    const grupoParaAlumno = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoParaAlumno)
      .mockResolvedValueOnce(entregaFake);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(GrupoConEntregaError);
    expect(mockTx.remove).not.toHaveBeenCalled();

    const grupoParaDocente = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoParaDocente)
      .mockResolvedValueOnce(entregaFake);

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      usuario: fakeUsuario("ana", DOCENTE),
    });

    expect(grupoParaDocente.estaVacio()).toBe(true);
    expect(resultado.grupoEliminado).toBe(false);
    expect(mockTx.remove).not.toHaveBeenCalled();
  });

  it("borra el grupo si el alumno era el último integrante y nunca hubo entrega", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(resultado.grupoEliminado).toBe(true);
    expect(mockTx.remove).toHaveBeenCalledWith(grupo);
  });

  it("consulta la entrega recién después de tomar el lock del grupo", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(mockTx.findOne).toHaveBeenNthCalledWith(
      1,
      Grupo,
      { id: "g1", assignment: { id: "a1" } },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    expect(mockTx.findOne).toHaveBeenNthCalledWith(2, Entrega, expect.anything(), expect.anything());
  });

  it("toma el advisory lock con la clave membresia:{assignmentId}:{alumnoId}", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(mockTx.execute).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtextextended(?, 0))",
      ["membresia:a1:alumno-ana"]
    );
  });
});

// ── moverAlumnoDeGrupo ──────────────────────────────────────

describe("moverAlumnoDeGrupo", () => {
  it("emite el DELETE del pivot origen antes del INSERT del destino", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoOrigen = fakeGrupo("g1", assignment, [ana]);
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen) // grupoOrigenPrevio (lectura sin lock)
      .mockResolvedValueOnce(grupoOrigen) // lock de g1
      .mockResolvedValueOnce(grupoDestino) // lock de g2
      .mockResolvedValueOnce(null); // sin entrega

    const orden: string[] = [];
    const removeMemberOriginal = grupoOrigen.removeMember.bind(grupoOrigen);
    vi.spyOn(grupoOrigen, "removeMember").mockImplementation((alumno) => {
      orden.push("removeMember");
      return removeMemberOriginal(alumno);
    });
    const addMemberOriginal = grupoDestino.addMember.bind(grupoDestino);
    vi.spyOn(grupoDestino, "addMember").mockImplementation((alumno) => {
      orden.push("addMember");
      return addMemberOriginal(alumno);
    });
    // Once x3 (no `mockImplementation` a secas): moverAlumnoDeGrupo flushea
    // exactamente 3 veces en este camino (removeMember, addMember, auditoría).
    // Con un `mockImplementation` sin acotar, el override se filtra a los
    // tests que corren después en este mismo archivo.
    mockTx.flush
      .mockImplementationOnce(async () => {
        orden.push("flush");
      })
      .mockImplementationOnce(async () => {
        orden.push("flush");
      })
      .mockImplementationOnce(async () => {
        orden.push("flush");
      });

    await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(orden).toEqual(["removeMember", "flush", "addMember", "flush", "flush"]);
  });

  it("da de alta al alumno cuando no tenía grupo en el assignment", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(null) // sin grupo previo
      .mockResolvedValueOnce(grupoDestino); // lock destino

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(resultado).toEqual({ grupoDestino, grupoOrigenEliminado: false });
    expect(grupoDestino.alumnos.contains(ana)).toBe(true);
    expect(mockTx.persist).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "alta", grupoOrigenId: undefined, grupoDestinoId: "g2" })
    );
  });

  it("es idempotente si el alumno ya está en el grupo destino: sin flush ni auditoría", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g2", assignment, [ana]);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupo) // grupoOrigenPrevio: ya es este mismo grupo
      .mockResolvedValueOnce(grupo); // lock del único grupo a bloquear

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(resultado).toEqual({ grupoDestino: grupo, grupoOrigenEliminado: false });
    expect(mockTx.flush).not.toHaveBeenCalled();
    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("lanza GrupoLlenoError si el grupo destino está completo", async () => {
    const assignment = fakeGrupal({ maxIntegrantes: 1 });
    const ana = fakeAlumno("alumno-ana", "ana");
    const carla = fakeAlumno("alumno-carla", "carla");
    const grupoOrigen = fakeGrupo("g1", assignment, [ana, carla]);
    const grupoDestino = fakeGrupo("g2", assignment, [fakeAlumno("alumno-bob", "bob")], 1);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen)
      .mockResolvedValueOnce(grupoOrigen)
      .mockResolvedValueOnce(grupoDestino)
      .mockResolvedValueOnce(null);

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "ana",
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(GrupoLlenoError);

    // El alumno sigue en su grupo original: el rollback real de Postgres
    // (verificado contra DB real en el test de integración) es lo que
    // garantiza esto en producción; acá solo se confirma que el flush del
    // origen ya había ocurrido antes de que el destino lo rechazara.
    expect(mockTx.flush).toHaveBeenCalledTimes(1);
  });

  it("borra el grupo origen si queda vacío y nunca tuvo entrega", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoOrigen = fakeGrupo("g1", assignment, [ana]);
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen)
      .mockResolvedValueOnce(grupoOrigen)
      .mockResolvedValueOnce(grupoDestino)
      .mockResolvedValueOnce(null);

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(resultado.grupoOrigenEliminado).toBe(true);
    expect(mockTx.remove).toHaveBeenCalledWith(grupoOrigen);
  });

  it("toma el advisory lock con la clave membresia:{assignmentId}:{alumnoId}", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDestino = fakeGrupo("g2", assignment, []);
    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grupoDestino);

    await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(mockTx.execute).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtextextended(?, 0))",
      ["membresia:a1:alumno-ana"]
    );
  });

  it("bloquea los grupos en orden ascendente de id, no por rol origen/destino", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoOrigen = fakeGrupo("g9", assignment, [ana]);
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen) // grupoOrigenPrevio
      .mockResolvedValueOnce(grupoDestino) // "g2" primero: es el menor
      .mockResolvedValueOnce(grupoOrigen) // "g9" después
      .mockResolvedValueOnce(null);

    await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      usuario: fakeUsuario("ana"),
    });

    expect(mockTx.findOne).toHaveBeenNthCalledWith(
      2,
      Grupo,
      { id: "g2", assignment: { id: "a1" } },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    expect(mockTx.findOne).toHaveBeenNthCalledWith(
      3,
      Grupo,
      { id: "g9", assignment: { id: "a1" } },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
  });

  it("traduce la violación del índice único de inscripción a AlumnoYaEnGrupoDelAssignmentError", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOneOrFail.mockResolvedValueOnce(ana);
    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grupoDestino);
    mockTx.flush.mockRejectedValueOnce(uniqueMembershipError());

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "ana",
        usuario: fakeUsuario("ana"),
      })
    ).rejects.toBeInstanceOf(AlumnoYaEnGrupoDelAssignmentError);
  });
});
