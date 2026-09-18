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
// Para que `new Grupo()` y `new MiembroDeGrupo()` funcionen sin BD, el ORM
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
  MiembroDeGrupo,
  InscripcionesCerradasError,
  AlumnoYaEnGrupoDelAssignmentError,
  NombreGrupoDuplicadoError,
  NombreGrupoInvalidoError,
  GrupoLlenoError,
  AssignmentNoGrupalError,
  AlumnoNoEsMiembroDelGrupoError,
  GrupoConEntregaError,
  GrupoNoAdmiteParticipanteError,
  DOCENTE,
  ParticipanteAlumno,
  ParticipanteDocente,
  AccesoAssignmentProhibidoError,
  AssignmentNoDisponibleError,
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
  type ActorDeMembresia,
  type Participante,
} from "@/domain/entities";
import { IndividualAssignment } from "@/domain/entities/IndividualAssignment";
import { LockMode, type Collection } from "@mikro-orm/core";
import { NombreRepositorioDemasiadoLargoError } from "@/lib/naming";

// ── Helpers ──────────────────────────────────────────────────

function fakeAlumno(id: string, githubUsername: string): Alumno {
  // Instancia real para que las comparaciones por `id`/`githubUsername` (y
  // `getAlumnoByGithub`, mockeado a nivel de EM) pasen el `instanceof` check.
  const alumno = new Alumno();
  alumno.id = id;
  alumno.githubUsername = githubUsername;
  alumno.legajo = `leg-${id}`;
  alumno.nombre = githubUsername;
  alumno.apellido = "Test";
  alumno.email = `${githubUsername}@test`;
  alumno.comision = fakeComision();
  // Registro confirmado en la misma comisión (issue #107, revisión de code
  // review): `ParticipanteAlumno` sólo participa con el registro
  // confirmado, no alcanza con tener `comision` asignada.
  alumno.confirmarRegistroEn(alumno.comision);
  return alumno;
}

function fakeComision(id = "c1"): Comision {
  const comision = new Comision(2026, "sheet-test");
  comision.id = id;
  return comision;
}

// Participantes de prueba — instancias reales de `Participante` (no fakes
// duck-typed): así se ejercita la autorización académica real
// (`autorizarAccionSobreAssignment`/`autorizarCambioDeMembresia`), que desde
// el issue #107/#112 vive en `Participante`, no en `GrupoRepository`.
function participanteAlumno(alumno: Alumno): Participante {
  return new ParticipanteAlumno(alumno, alumno.githubUsername);
}

function participanteDocente(
  githubUsername: string,
  comisionActiva: Comision | null = fakeComision()
): Participante {
  return new ParticipanteDocente(githubUsername, comisionActiva);
}

// El docente administrando la membresía de otro (no la propia) — el bypass
// administrativo sigue vivo acá, vía `RolDeUsuario.actorSobreMembresiaAjena()`.
function actorDocente(): ActorDeMembresia {
  return DOCENTE.actorSobreMembresiaAjena("a1");
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
  // esté disponible. Los tests de ciclo de vida overridean `estadoNombre`
  // explícitamente.
  grupal.transicionarA("publicado", { tieneEntregas: false }, "docente1");
  Object.assign(grupal, overrides);
  return grupal;
}

// Los miembros nacen siempre vinculados al `Alumno` que se les pasa — mismo
// caso que ejercitaban los tests antes de #107/#112. `Grupo.test.ts` cubre
// el caso de un miembro sin alumno a nivel unitario.
function fakeGrupo(
  id: string,
  assignment: GrupalAssignment,
  alumnosIniciales: Alumno[],
  maxIntegrantes = assignment.maxIntegrantes
): Grupo {
  const grupo = new Grupo();
  grupo.id = id;
  grupo.nombre = `grupo-${id}`;
  grupo.nombreNormalizado = `grupo-${id}`;
  grupo.paradigma = assignment.paradigma;
  grupo.assignment = assignment;
  grupo.maxIntegrantes = maxIntegrantes;
  grupo.creadoPor = alumnosIniciales[0]?.githubUsername ?? "alguien";
  const items: MiembroDeGrupo[] = alumnosIniciales.map((alumno) =>
    Object.assign(new MiembroDeGrupo(), {
      id: `miembro-${alumno.id}`,
      githubUsername: alumno.githubUsername,
      assignmentId: assignment.id,
      alumno,
    })
  );
  grupo.miembros = {
    contains: (miembro: MiembroDeGrupo) => items.some((item) => item.id === miembro.id),
    add: (miembro: MiembroDeGrupo) => items.push(miembro),
    remove: (miembro: MiembroDeGrupo) => {
      const index = items.findIndex((item) => item.id === miembro.id);
      if (index !== -1) items.splice(index, 1);
    },
    getItems: () => items,
    get length() {
      return items.length;
    },
  } as unknown as Collection<MiembroDeGrupo>;
  return grupo;
}

function uniqueMembershipError(): Error {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "grupo_miembro_assignment_username_unique_idx"'
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

    const grupo = await crearGrupo({
      assignmentId: "a1",
      nombre: "  Los Lógicos ++  ",
      participante: participanteAlumno(ana),
    });

    expect(grupo.nombre).toBe("Los Lógicos ++");
    expect(grupo.nombreNormalizado).toBe("los-logicos");
    expect(grupo.paradigma).toBe("funcional");
    expect(grupo.maxIntegrantes).toBe(3);
    expect(grupo.assignment).toBe(assignment);
    expect(grupo.creadoPor).toBe("ana");
    expect(grupo.tipoDeIntegrantes).toBe("alumnos");
    expect(grupo.contieneA("ana")).toBe(true);
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
  // assignment — antes fallaba sin tocar la DB, ahora falla sin persistir
  // nada (mismo resultado observable para quien llama).
  it("rechaza un nombre que queda vacío después de normalizar", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(fakeGrupal());

    await expect(
      crearGrupo({ assignmentId: "a1", nombre: " +++ ", participante: participanteAlumno(ana) })
    ).rejects.toBeInstanceOf(NombreGrupoInvalidoError);

    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("rechaza un nombre que haría superar el límite del repositorio", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(fakeGrupal({ slug: "a".repeat(90) }));

    await expect(
      crearGrupo({
        assignmentId: "a1",
        nombre: "b".repeat(10),
        participante: participanteAlumno(ana),
      })
    ).rejects.toBeInstanceOf(NombreRepositorioDemasiadoLargoError);

    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("lanza AssignmentNoEncontradoError si el assignment no existe", async () => {
    mockTx.findOne.mockResolvedValueOnce(null);

    await expect(
      crearGrupo({
        assignmentId: "a1",
        nombre: "x",
        participante: participanteAlumno(fakeAlumno("alumno-ana", "ana")),
      })
    ).rejects.toBeInstanceOf(AssignmentNoEncontradoError);
  });

  it("lanza AssignmentNoGrupalError si el assignment es individual", async () => {
    const individual = new IndividualAssignment();
    individual.id = "a1";
    mockTx.findOne.mockResolvedValueOnce(individual);

    await expect(
      crearGrupo({
        assignmentId: "a1",
        nombre: "x",
        participante: participanteAlumno(fakeAlumno("alumno-ana", "ana")),
      })
    ).rejects.toBeInstanceOf(AssignmentNoGrupalError);
  });

  it("lanza InscripcionesCerradasError si el docente cerró las inscripciones", async () => {
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne.mockResolvedValueOnce(fakeGrupal({ inscripcionesCerradas: true }));

    await expect(
      crearGrupo({ assignmentId: "a1", nombre: "x", participante: participanteAlumno(ana) })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);
  });

  // issue #107/#112: ya no hay bypass — un docente en Mis TPs sigue las
  // mismas reglas de membresía que un alumno (antes esto lo resolvía
  // `RolDocente.autorizarCambioDeMembresia`, que siempre resolvía).
  it("un docente en Mis TPs tampoco crea un grupo con inscripciones cerradas", async () => {
    mockTx.findOne.mockResolvedValueOnce(fakeGrupal({ inscripcionesCerradas: true }));

    await expect(
      crearGrupo({
        assignmentId: "a1",
        nombre: "Los Lógicos",
        participante: participanteDocente("profe-docente"),
      })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);
  });

  it("lanza AlumnoYaEnGrupoDelAssignmentError si el alumno ya está en otro grupo del mismo assignment", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoExistente = fakeGrupo("g-otro", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce(grupoExistente);

    await expect(
      crearGrupo({ assignmentId: "a1", nombre: "x", participante: participanteAlumno(ana) })
    ).rejects.toBeInstanceOf(AlumnoYaEnGrupoDelAssignmentError);
    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  it("rechaza dentro de la transacción a un alumno de otra comisión", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    // Confirmada en la comisión nueva: lo que hay que probar es el rechazo
    // por comisión distinta a la del assignment, no por registro sin
    // confirmar (issue #107, revisión de code review).
    ana.confirmarRegistroEn(ana.comision);
    mockTx.findOne.mockResolvedValueOnce(assignment);

    await expect(
      crearGrupo({ assignmentId: "a1", nombre: "x", participante: participanteAlumno(ana) })
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

    await expect(
      crearGrupo({ assignmentId: "a1", nombre: "x", participante: participanteAlumno(ana) })
    ).rejects.toBeInstanceOf(AssignmentNoDisponibleError);
    expect(mockTx.persist).not.toHaveBeenCalled();
  });

  // El docente participa desde la comisión activa, no "la propia" — si no
  // coincide con la del assignment, se lo rechaza igual que a un alumno.
  it("rechaza al docente si el assignment no es de su comisión activa", async () => {
    const assignment = fakeGrupal(); // comisión "c1"
    mockTx.findOne.mockResolvedValueOnce(assignment);

    await expect(
      crearGrupo({
        assignmentId: "a1",
        nombre: "x",
        participante: participanteDocente("profe-docente", fakeComision("c2")),
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);
  });

  it("el docente crea un grupo de docentes cuando la comisión activa coincide", async () => {
    const assignment = fakeGrupal(); // comisión "c1"
    mockTx.findOne
      .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce(null);

    const grupo = await crearGrupo({
      assignmentId: "a1",
      nombre: "Profes FP",
      participante: participanteDocente("profe-docente", fakeComision("c1")),
    });

    expect(grupo.tipoDeIntegrantes).toBe("docentes");
    expect(grupo.contieneA("profe-docente")).toBe(true);
    expect(mockTx.flush).toHaveBeenCalled();
  });

  it("traduce el conflicto concurrente de inscripción única", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    mockTx.findOne
      .mockResolvedValueOnce(assignment)
      .mockResolvedValueOnce(null);
    mockTx.flush.mockRejectedValueOnce(uniqueMembershipError());

    await expect(
      crearGrupo({
        assignmentId: "a1",
        nombre: "Los Lambdas",
        participante: participanteAlumno(ana),
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
    mockTx.flush.mockRejectedValueOnce(uniqueGroupNameError());

    await expect(
      crearGrupo({
        assignmentId: "a1",
        nombre: "Los Lambdas",
        participante: participanteAlumno(ana),
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
        participante: participanteAlumno(fakeAlumno("alumno-ana", "ana")),
      })
    ).rejects.toBeInstanceOf(GrupoNoEncontradoError);

    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("happy path: suma al alumno y flushea", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo) // Grupo
      .mockResolvedValueOnce(null); // enOtroGrupo

    const resultado = await unirseAGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      participante: participanteAlumno(ana),
    });

    expect(resultado).toBe(grupo);
    expect(mockTx.findOne).toHaveBeenNthCalledWith(
      1,
      Grupo,
      { id: "g1", assignment: { id: "a1" } },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    expect(mockTx.populate).toHaveBeenCalledWith(
      grupo,
      ["miembros", "assignment.comision"],
      { refresh: true }
    );
    expect(grupo.contieneA("ana")).toBe(true);
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

    const resultado = await unirseAGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      participante: participanteAlumno(ana),
    });

    expect(resultado).toBe(grupo);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("lanza InscripcionesCerradasError cuando el docente cerró el assignment", async () => {
    const assignment = fakeGrupal({ inscripcionesCerradas: true });
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne.mockResolvedValueOnce(grupo);

    await expect(
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", participante: participanteAlumno(ana) })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);
  });

  // issue #107/#112: mismo criterio que en `crearGrupo` — sin bypass, un
  // docente en Mis TPs tampoco se une con inscripciones cerradas.
  it("un docente en Mis TPs tampoco se une a un grupo con inscripciones cerradas", async () => {
    const assignment = fakeGrupal({ inscripcionesCerradas: true });
    const grupo = fakeGrupo("g1", assignment, []);
    grupo.tipoDeIntegrantes = "docentes";
    mockTx.findOne.mockResolvedValueOnce(grupo);

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        participante: participanteDocente("profe-docente"),
      })
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

    await expect(
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", participante: participanteAlumno(ana) })
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

    await expect(
      unirseAGrupo({ assignmentId: "a1", grupoId: "g1", participante: participanteAlumno(cora) })
    ).rejects.toBeInstanceOf(GrupoLlenoError);
  });

  it("toda la operación corre dentro de em.transactional para resolver races", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    await unirseAGrupo({ assignmentId: "a1", grupoId: "g1", participante: participanteAlumno(ana) });

    expect(mockEm.transactional).toHaveBeenCalledTimes(1);
  });

  it("rechaza dentro de la transacción a un alumno de otra comisión", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    // Confirmada en la comisión nueva: lo que hay que probar es el rechazo
    // por comisión distinta a la del assignment, no por registro sin
    // confirmar (issue #107, revisión de code review).
    ana.confirmarRegistroEn(ana.comision);
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne.mockResolvedValueOnce(grupo);

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        participante: participanteAlumno(ana),
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

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        participante: participanteAlumno(ana),
      })
    ).rejects.toBeInstanceOf(AssignmentNoDisponibleError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("el docente se une a un grupo de docentes cuando la comisión activa coincide", async () => {
    const assignment = fakeGrupal();
    const grupo = fakeGrupo("g1", assignment, []);
    grupo.tipoDeIntegrantes = "docentes";
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        participante: participanteDocente("profe-docente", fakeComision("c1")),
      })
    ).resolves.toBe(grupo);

    expect(mockTx.flush).toHaveBeenCalled();
  });

  // issue #107/#112: un alumno no ve ni puede unirse a un grupo de
  // docentes, y viceversa.
  it("el docente no se une a un grupo de alumnos (409)", async () => {
    const assignment = fakeGrupal();
    const grupo = fakeGrupo("g1", assignment, []); // "alumnos" por defecto
    mockTx.findOne.mockResolvedValueOnce(grupo);

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        participante: participanteDocente("profe-docente", fakeComision("c1")),
      })
    ).rejects.toBeInstanceOf(GrupoNoAdmiteParticipanteError);

    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("traduce el conflicto concurrente al unirse a dos grupos", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);
    mockTx.flush.mockRejectedValueOnce(uniqueMembershipError());

    await expect(
      unirseAGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        participante: participanteAlumno(ana),
      })
    ).rejects.toMatchObject({
      constructor: AlumnoYaEnGrupoDelAssignmentError,
      assignmentId: "a1",
      githubUsername: "ana",
    });
  });
});

// upsertGrupoConMiembro no cambia en la Fase B: es exclusivo de la
// sincronización desde Sheets, siempre por `Alumno` — no hay Participante
// involucrado.
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
      ["miembros"],
      { refresh: true }
    );
    expect(grupo.contieneA("ana")).toBe(true);
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

  // Revisión de code review (issue #107): la planilla sólo importa alumnos —
  // reutilizar acá un grupo de docentes homónimo sumaría un alumno a un
  // grupo de demo del docente.
  it("no reutiliza un grupo de docentes homónimo: lanza NombreGrupoDuplicadoError y no agrega al alumno", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDeDocentes = fakeGrupo("g1", assignment, []);
    grupoDeDocentes.tipoDeIntegrantes = "docentes";
    mockTx.findOne.mockResolvedValueOnce(grupoDeDocentes);

    await expect(
      upsertGrupoConMiembro({
        nombreGrupo: grupoDeDocentes.nombre,
        paradigma: "funcional",
        assignment,
        alumno: ana,
      })
    ).rejects.toBeInstanceOf(NombreGrupoDuplicadoError);

    expect(grupoDeDocentes.contieneA("ana")).toBe(false);
    expect(mockTx.persist).not.toHaveBeenCalled();
    expect(mockTx.flush).not.toHaveBeenCalled();
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
      ["miembros"],
      { refresh: true }
    );
    expect(ganador.contieneA("ana")).toBe(true);
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
    mockTx.findOne
      .mockResolvedValueOnce(grupo) // lock del grupo
      .mockResolvedValueOnce(null); // sin entrega

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(resultado).toEqual({ grupo, grupoEliminado: false });
    expect(grupo.contieneA("ana")).toBe(false);
    expect(grupo.contieneA("bob")).toBe(true);
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
    mockTx.findOne.mockResolvedValueOnce(null);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        actor: actorDocente(),
        realizadoPor: "docente1",
      })
    ).rejects.toBeInstanceOf(GrupoNoEncontradoError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("lanza AlumnoNoEsMiembroDelGrupoError si el alumno no está en el grupo", async () => {
    const assignment = fakeGrupal();
    const grupo = fakeGrupo("g1", assignment, [fakeAlumno("alumno-bob", "bob")]);
    mockTx.findOne.mockResolvedValueOnce(grupo);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        actor: actorDocente(),
        realizadoPor: "docente1",
      })
    ).rejects.toBeInstanceOf(AlumnoNoEsMiembroDelGrupoError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("rechaza al alumno con inscripciones cerradas, pero permite al docente administrando a otro", async () => {
    const assignment = fakeGrupal({ inscripcionesCerradas: true });
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoParaAlumno = fakeGrupo("g1", assignment, [ana, fakeAlumno("alumno-bob", "bob")]);

    mockTx.findOne
      .mockResolvedValueOnce(grupoParaAlumno)
      .mockResolvedValueOnce(null);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        actor: participanteAlumno(ana),
        realizadoPor: "ana",
      })
    ).rejects.toBeInstanceOf(InscripcionesCerradasError);

    const grupoParaDocente = fakeGrupo("g1", assignment, [ana, fakeAlumno("alumno-bob", "bob")]);
    mockTx.findOne
      .mockResolvedValueOnce(grupoParaDocente)
      .mockResolvedValueOnce(null);

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: actorDocente(),
      realizadoPor: "docente1",
    });
    expect(resultado.grupo).toBe(grupoParaDocente);
  });

  it("rechaza al alumno si el grupo ya aceptó el TP, y no lo borra aunque quede vacío para el docente administrando a otro", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const entregaFake = Object.assign(new Entrega(), { id: "e1" });

    const grupoParaAlumno = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupoParaAlumno)
      .mockResolvedValueOnce(entregaFake);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        actor: participanteAlumno(ana),
        realizadoPor: "ana",
      })
    ).rejects.toBeInstanceOf(GrupoConEntregaError);
    expect(mockTx.remove).not.toHaveBeenCalled();

    const grupoParaDocente = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupoParaDocente)
      .mockResolvedValueOnce(entregaFake);

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: actorDocente(),
      realizadoPor: "docente1",
    });

    expect(grupoParaDocente.estaVacio()).toBe(true);
    expect(resultado.grupoEliminado).toBe(false);
    expect(mockTx.remove).not.toHaveBeenCalled();
  });

  it("borra el grupo si el alumno era el último integrante y nunca hubo entrega", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(resultado.grupoEliminado).toBe(true);
    expect(mockTx.remove).toHaveBeenCalledWith(grupo);
  });

  it("consulta la entrega recién después de tomar el lock del grupo", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(mockTx.findOne).toHaveBeenNthCalledWith(
      1,
      Grupo,
      { id: "g1", assignment: { id: "a1" } },
      { lockMode: LockMode.PESSIMISTIC_WRITE }
    );
    expect(mockTx.findOne).toHaveBeenNthCalledWith(2, Entrega, expect.anything(), expect.anything());
  });

  it("toma el advisory lock con la clave membresia:{assignmentId}:{githubUsername}", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(mockTx.execute).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtextextended(?, 0))",
      ["membresia:a1:ana"]
    );
  });

  // Revisión de code review (issue #107/#112): antes `salirDeGrupo` en
  // self-service sólo pedía `autorizarCambioDeMembresia`, que no chequeaba
  // acceso al assignment — a diferencia de crear/unirse/mover, que ya lo
  // hacían vía `autorizarAccionSobreAssignment`.
  it("un participante sin acceso al assignment no puede salir del grupo por self-service", async () => {
    const assignment = fakeGrupal(); // comisión "c1"
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    // Confirmada en la comisión nueva: lo que hay que probar es el rechazo
    // por comisión distinta a la del assignment, no por registro sin
    // confirmar (issue #107, revisión de code review).
    ana.confirmarRegistroEn(ana.comision);
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    await expect(
      salirDeGrupo({
        assignmentId: "a1",
        grupoId: "g1",
        githubUsername: "ana",
        actor: participanteAlumno(ana),
        realizadoPor: "ana",
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("el docente administrando a otro sí lo quita aunque no tenga comisión", async () => {
    const assignment = fakeGrupal();
    assignment.comision = undefined; // ej. un assignment histórico sin comisión
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g1", assignment, [ana]);
    mockTx.findOne
      .mockResolvedValueOnce(grupo)
      .mockResolvedValueOnce(null);

    const resultado = await salirDeGrupo({
      assignmentId: "a1",
      grupoId: "g1",
      githubUsername: "ana",
      actor: actorDocente(),
      realizadoPor: "docente1",
    });

    expect(resultado.grupo).toBe(grupo);
  });
});

// ── moverAlumnoDeGrupo ──────────────────────────────────────

describe("moverAlumnoDeGrupo", () => {
  it("emite el DELETE del pivot origen antes del INSERT del destino", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoOrigen = fakeGrupo("g1", assignment, [ana]);
    const grupoDestino = fakeGrupo("g2", assignment, []);

    // Cambio (ana ya tenía grupo, con `alumno` vinculado en el miembro
    // origen): no hace falta resolver el alumno por `getAlumnoByGithub`.
    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen) // grupoOrigenPrevio (lectura sin lock)
      .mockResolvedValueOnce(grupoOrigen) // lock de g1
      .mockResolvedValueOnce(grupoDestino) // lock de g2
      .mockResolvedValueOnce(null); // sin entrega

    const orden: string[] = [];
    const quitarMiembroOriginal = grupoOrigen.quitarMiembro.bind(grupoOrigen);
    vi.spyOn(grupoOrigen, "quitarMiembro").mockImplementation((githubUsername) => {
      orden.push("quitarMiembro");
      return quitarMiembroOriginal(githubUsername);
    });
    const agregarMiembroOriginal = grupoDestino.agregarMiembro.bind(grupoDestino);
    vi.spyOn(grupoDestino, "agregarMiembro").mockImplementation((githubUsername, alumno) => {
      orden.push("agregarMiembro");
      return agregarMiembroOriginal(githubUsername, alumno);
    });
    // Once x3 (no `mockImplementation` a secas): moverAlumnoDeGrupo flushea
    // exactamente 3 veces en este camino (quitarMiembro, agregarMiembro,
    // auditoría). Con un `mockImplementation` sin acotar, el override se
    // filtra a los tests que corren después en este mismo archivo.
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
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(orden).toEqual(["quitarMiembro", "flush", "agregarMiembro", "flush", "flush"]);
  });

  it("da de alta al alumno cuando no tenía grupo en el assignment", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDestino = fakeGrupo("g2", assignment, []);

    // Alta (sin grupo origen): el vínculo con `Alumno` se resuelve vía
    // `getAlumnoByGithub`, que corre sobre la misma transacción — un
    // `findOne(Alumno, ...)` más en la cola de `mockTx.findOne`.
    mockTx.findOne
      .mockResolvedValueOnce(null) // sin grupo previo
      .mockResolvedValueOnce(grupoDestino) // lock destino
      .mockResolvedValueOnce(ana); // getAlumnoByGithub

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(resultado).toEqual({ grupoDestino, grupoOrigenEliminado: false });
    expect(grupoDestino.contieneA("ana")).toBe(true);
    expect(mockTx.persist).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "alta", grupoOrigenId: undefined, grupoDestinoId: "g2" })
    );
  });

  it("es idempotente si el alumno ya está en el grupo destino: sin flush ni auditoría", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupo = fakeGrupo("g2", assignment, [ana]);

    mockTx.findOne
      .mockResolvedValueOnce(grupo) // grupoOrigenPrevio: ya es este mismo grupo
      .mockResolvedValueOnce(grupo); // lock del único grupo a bloquear

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
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
        actor: participanteAlumno(ana),
        realizadoPor: "ana",
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

    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen)
      .mockResolvedValueOnce(grupoOrigen)
      .mockResolvedValueOnce(grupoDestino)
      .mockResolvedValueOnce(null);

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(resultado.grupoOrigenEliminado).toBe(true);
    expect(mockTx.remove).toHaveBeenCalledWith(grupoOrigen);
  });

  it("toma el advisory lock con la clave membresia:{assignmentId}:{githubUsername}", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDestino = fakeGrupo("g2", assignment, []);
    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grupoDestino)
      .mockResolvedValueOnce(ana); // getAlumnoByGithub (alta)

    await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
    });

    expect(mockTx.execute).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtextextended(?, 0))",
      ["membresia:a1:ana"]
    );
  });

  it("bloquea los grupos en orden ascendente de id, no por rol origen/destino", async () => {
    const assignment = fakeGrupal();
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoOrigen = fakeGrupo("g9", assignment, [ana]);
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen) // grupoOrigenPrevio
      .mockResolvedValueOnce(grupoDestino) // "g2" primero: es el menor
      .mockResolvedValueOnce(grupoOrigen) // "g9" después
      .mockResolvedValueOnce(null);

    await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "ana",
      actor: participanteAlumno(ana),
      realizadoPor: "ana",
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

    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grupoDestino)
      .mockResolvedValueOnce(ana); // getAlumnoByGithub (alta)
    mockTx.flush.mockRejectedValueOnce(uniqueMembershipError());

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "ana",
        actor: participanteAlumno(ana),
        realizadoPor: "ana",
      })
    ).rejects.toBeInstanceOf(AlumnoYaEnGrupoDelAssignmentError);
  });

  // Revisión de code review (issue #107/#112): antes el tipo requerido se
  // calculaba sólo a partir del grupo origen, sin validar acceso al
  // assignment ni pedirle el tipo al actor — un docente o un alumno sin
  // registro podían darse de alta en un grupo de alumnos vía este PUT,
  // aunque `unirseAGrupo` ya los rechazaba.
  it("un docente no puede darse de alta a sí mismo en un grupo de alumnos", async () => {
    const assignment = fakeGrupal();
    const grupoDestino = fakeGrupo("g2", assignment, []); // tipoDeIntegrantes por defecto: "alumnos"

    mockTx.findOne
      .mockResolvedValueOnce(null) // sin grupo previo
      .mockResolvedValueOnce(grupoDestino); // lock destino

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "profe-docente",
        actor: participanteDocente("profe-docente"),
        realizadoPor: "profe-docente",
      })
    ).rejects.toBeInstanceOf(GrupoNoAdmiteParticipanteError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("un usuario sin registro no puede darse de alta en un grupo", async () => {
    const assignment = fakeGrupal();
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grupoDestino);

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "sinregistro",
        actor: new ParticipanteAlumno(null, "sinregistro"),
        realizadoPor: "sinregistro",
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("un alumno no puede darse de alta en un grupo de un assignment de otra comisión", async () => {
    const assignment = fakeGrupal(); // comisión "c1"
    const ana = fakeAlumno("alumno-ana", "ana");
    ana.comision = fakeComision("c2");
    // Confirmada en la comisión nueva: lo que hay que probar es el rechazo
    // por comisión distinta a la del assignment, no por registro sin
    // confirmar (issue #107, revisión de code review).
    ana.confirmarRegistroEn(ana.comision);
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grupoDestino);

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "ana",
        actor: participanteAlumno(ana),
        realizadoPor: "ana",
      })
    ).rejects.toBeInstanceOf(AccesoAssignmentProhibidoError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("un alumno no puede darse de alta en un assignment en borrador", async () => {
    const assignment = fakeGrupal();
    assignment.estadoNombre = "borrador";
    const ana = fakeAlumno("alumno-ana", "ana");
    const grupoDestino = fakeGrupo("g2", assignment, []);

    mockTx.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(grupoDestino);

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "ana",
        actor: participanteAlumno(ana),
        realizadoPor: "ana",
      })
    ).rejects.toBeInstanceOf(AssignmentNoDisponibleError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("el docente administrando a otro conserva el alcance global y mueve dentro del tipo del grupo origen", async () => {
    const assignment = fakeGrupal();
    // Borrador: un `Participante` en self-service sería rechazado acá
    // (`AssignmentNoDisponibleError`) — el docente administrando a otro
    // conserva su alcance global y no le importa el estado.
    assignment.estadoNombre = "borrador";
    const profeUno = fakeAlumno("alumno-profe1", "profe1");
    const grupoOrigen = fakeGrupo("g1", assignment, [profeUno]);
    grupoOrigen.tipoDeIntegrantes = "docentes";
    const grupoDestino = fakeGrupo("g2", assignment, []);
    grupoDestino.tipoDeIntegrantes = "docentes";

    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen) // grupoOrigenPrevio
      .mockResolvedValueOnce(grupoOrigen) // lock g1
      .mockResolvedValueOnce(grupoDestino) // lock g2
      .mockResolvedValueOnce(null); // sin entrega

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "profe1",
      actor: actorDocente(),
      realizadoPor: "docente1",
    });

    expect(resultado.grupoDestino).toBe(grupoDestino);
  });

  // Revisión de code review (issue #107): en self-service el acceso ya
  // impide dar de alta a alguien sin fila en `Alumno`, pero un docente
  // administrando a otro podía sumar cualquier username a un grupo de
  // alumnos sin que exista ese registro (auditoría sin `alumnoId`, sin
  // nombre completo en admin, sin fila para la planilla).
  it("el docente no puede dar de alta en un grupo de alumnos a un username sin fila en Alumno", async () => {
    const assignment = fakeGrupal();
    const grupoDestino = fakeGrupo("g2", assignment, []); // tipoDeIntegrantes por defecto: "alumnos"

    mockTx.findOne
      .mockResolvedValueOnce(null) // sin grupo previo
      .mockResolvedValueOnce(grupoDestino) // lock destino
      .mockResolvedValueOnce(null); // getAlumnoByGithub: sin fila en Alumno

    await expect(
      moverAlumnoDeGrupo({
        assignmentId: "a1",
        grupoDestinoId: "g2",
        githubUsername: "sin-alumno",
        actor: actorDocente(),
        realizadoPor: "docente1",
      })
    ).rejects.toBeInstanceOf(GrupoNoAdmiteParticipanteError);
    expect(mockTx.flush).not.toHaveBeenCalled();
  });

  it("el docente sí puede dar de alta en un grupo de docentes a un username sin fila en Alumno", async () => {
    const assignment = fakeGrupal();
    const grupoOrigen = fakeGrupo("g1", assignment, []);
    grupoOrigen.tipoDeIntegrantes = "docentes";
    // Miembro sin vínculo con `Alumno` (docente en un grupo de demo).
    grupoOrigen.agregarMiembro("profe-sin-alumno", null);
    const grupoDestino = fakeGrupo("g2", assignment, []);
    grupoDestino.tipoDeIntegrantes = "docentes";

    mockTx.findOne
      .mockResolvedValueOnce(grupoOrigen) // grupoOrigenPrevio
      .mockResolvedValueOnce(grupoOrigen) // lock g1
      .mockResolvedValueOnce(grupoDestino) // lock g2
      .mockResolvedValueOnce(null) // sin entrega
      .mockResolvedValueOnce(null); // getAlumnoByGithub: sin fila en Alumno

    const resultado = await moverAlumnoDeGrupo({
      assignmentId: "a1",
      grupoDestinoId: "g2",
      githubUsername: "profe-sin-alumno",
      actor: actorDocente(),
      realizadoPor: "docente1",
    });

    expect(resultado.grupoDestino).toBe(grupoDestino);
    expect(grupoDestino.contieneA("profe-sin-alumno")).toBe(true);
  });
});
