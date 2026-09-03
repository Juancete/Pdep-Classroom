import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConnection = { execute: vi.fn() };

const mockEm: {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findOneOrFail: ReturnType<typeof vi.fn>;
  getReference: ReturnType<typeof vi.fn>;
  getConnection: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  transactional: ReturnType<typeof vi.fn>;
} = {
  find: vi.fn(),
  findOne: vi.fn(),
  findOneOrFail: vi.fn(),
  getReference: vi.fn(),
  getConnection: vi.fn(() => mockConnection),
  persist: vi.fn(),
  flush: vi.fn(),
  transactional: vi.fn(),
};
mockEm.transactional.mockImplementation(
  async (callback: (transaction: typeof mockEm) => unknown) => callback(mockEm)
);

vi.mock("@/infrastructure/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

import { LockMode } from "@mikro-orm/core";
import { Alumno, Assignment, Entrega, Grupo, DOCENTE, ESTUDIANTE } from "@/domain/entities";
import { AssignmentNoDisponibleError } from "@/application/assignmentAuthorization";
import {
  createEntrega,
  createOrGetEntrega,
  crearEntregaSiAssignmentDisponible,
  getEntregasConRepoActivo,
  getActiveRepoCountsByAssignment,
  getEntregaLogica,
  actualizarCIDeEntrega,
  conLockDeEntrega,
  actualizarActividadDeEntrega,
  marcarRepoBorrado,
  renombrarRepoDeEntrega,
  actualizarColaboradoresDeEntrega,
  getEntregaPorRepoGithubId,
  asegurarRepoGithubId,
  iniciarProvisionEntrega,
  marcarCreacionGithubIniciada,
} from "./EntregaRepository";

function fakeAssignmentDisponible(disponible: boolean) {
  return { permiteAccionesDeAlumno: () => disponible };
}

describe("EntregaRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEm.find.mockResolvedValue([]);
    mockEm.findOne.mockResolvedValue(null);
    mockEm.findOneOrFail.mockResolvedValue({ id: "a1" });
    mockEm.getReference.mockImplementation((Entity: unknown, id: string) => ({ Entity, id }));
    mockEm.flush.mockResolvedValue(undefined);
  });

  it("crea una entrega individual asociando alumnoId", async () => {
    await createEntrega({
      assignmentId: "a1",
      repoName: "kata-juan",
      repoUrl: "https://github.com/org/kata-juan",
      githubUsernames: ["juan"],
      alumnoId: "alumno-1",
    });

    const entrega = mockEm.persist.mock.calls[0][0] as Entrega;
    expect(mockEm.findOneOrFail).toHaveBeenCalledWith(Assignment, { id: "a1" });
    expect(mockEm.getReference).toHaveBeenCalledWith(Alumno, "alumno-1");
    expect(entrega.alumno).toEqual({ Entity: Alumno, id: "alumno-1" });
    expect(entrega.grupo).toBeUndefined();
    expect(entrega.repoGithubId).toBeUndefined();
  });

  it("persiste repoGithubId cuando se lo pasa (issue #60)", async () => {
    await createEntrega({
      assignmentId: "a1",
      repoName: "kata-juan",
      repoUrl: "https://github.com/org/kata-juan",
      githubUsernames: ["juan"],
      alumnoId: "alumno-1",
      repoGithubId: "999888",
    });

    const entrega = mockEm.persist.mock.calls[0][0] as Entrega;
    expect(entrega.repoGithubId).toBe("999888");
  });

  it("crea una entrega grupal asociando grupoId", async () => {
    await createEntrega({
      assignmentId: "a1",
      repoName: "kata-los-lambdas",
      repoUrl: "https://github.com/org/kata-los-lambdas",
      githubUsernames: ["juan", "maria"],
      grupoId: "g1",
    });

    const entrega = mockEm.persist.mock.calls[0][0] as Entrega;
    expect(mockEm.getReference).toHaveBeenCalledWith(Grupo, "g1");
    expect(entrega.grupo).toEqual({ Entity: Grupo, id: "g1" });
    expect(entrega.alumno).toBeUndefined();
  });

  it("busca entrega lógica individual por assignment y alumno", async () => {
    await getEntregaLogica({ assignmentId: "a1", alumnoId: "alumno-1" });

    expect(mockEm.findOne).toHaveBeenCalledWith(
      Entrega,
      { assignment: { id: "a1" }, alumno: { id: "alumno-1" } },
      { populate: ["assignment", "grupo", "alumno"] }
    );
  });

  it("busca entrega lógica grupal por assignment y grupo", async () => {
    await getEntregaLogica({ assignmentId: "a1", grupoId: "g1" });

    expect(mockEm.findOne).toHaveBeenCalledWith(
      Entrega,
      { assignment: { id: "a1" }, grupo: { id: "g1" } },
      { populate: ["assignment", "grupo", "alumno"] }
    );
  });

  it("createOrGetEntrega devuelve existente por repoName sin insertar", async () => {
    const existing = new Entrega();
    existing.assignment = { id: "a1" } as Assignment;
    mockEm.findOne.mockResolvedValueOnce(existing);

    await expect(
      createOrGetEntrega({
        assignmentId: "a1",
        repoName: "kata-juan",
        repoUrl: "https://github.com/org/kata-juan",
        githubUsernames: ["juan"],
        alumnoId: "alumno-1",
      })
    ).resolves.toBe(existing);

    expect(mockEm.persist).not.toHaveBeenCalled();
  });

  it("createOrGetEntrega ignora repoName existente de otro assignment y busca por entrega lógica", async () => {
    const repoMatch = new Entrega();
    repoMatch.assignment = { id: "otro-assignment" } as Assignment;
    const logicalMatch = new Entrega();
    logicalMatch.assignment = { id: "a1" } as Assignment;
    mockEm.findOne
      .mockResolvedValueOnce(repoMatch)
      .mockResolvedValueOnce(logicalMatch);

    await expect(
      createOrGetEntrega({
        assignmentId: "a1",
        repoName: "kata-juan",
        repoUrl: "https://github.com/org/kata-juan",
        githubUsernames: ["juan"],
        alumnoId: "alumno-1",
      })
    ).resolves.toBe(logicalMatch);

    expect(mockEm.findOne).toHaveBeenNthCalledWith(
      2,
      Entrega,
      { assignment: { id: "a1" }, alumno: { id: "alumno-1" } },
      { populate: ["assignment", "grupo", "alumno"] }
    );
    expect(mockEm.persist).not.toHaveBeenCalled();
  });

  it("createOrGetEntrega reconsulta y devuelve existente ante violación única", async () => {
    const existing = new Entrega();
    existing.assignment = { id: "a1" } as Assignment;
    const duplicate = new Error("duplicate key value violates unique constraint");
    (duplicate as NodeJS.ErrnoException).code = "23505";

    mockEm.findOne
      .mockResolvedValueOnce(null) // repo lookup inicial
      .mockResolvedValueOnce(null) // lógica lookup inicial
      .mockResolvedValueOnce(existing); // repo lookup tras duplicate
    mockEm.flush.mockRejectedValueOnce(duplicate);

    await expect(
      createOrGetEntrega({
        assignmentId: "a1",
        repoName: "kata-juan",
        repoUrl: "https://github.com/org/kata-juan",
        githubUsernames: ["juan"],
        alumnoId: "alumno-1",
      })
    ).resolves.toBe(existing);
  });

  describe("crearEntregaSiAssignmentDisponible", () => {
    it("crea la entrega cuando el assignment está disponible para el alumno", async () => {
      mockEm.findOne
        .mockResolvedValueOnce(fakeAssignmentDisponible(true)) // lock del assignment
        .mockResolvedValueOnce(null) // repo lookup
        .mockResolvedValueOnce(null); // lógica lookup

      await crearEntregaSiAssignmentDisponible(
        {
          assignmentId: "a1",
          repoName: "kata-juan",
          repoUrl: "https://github.com/org/kata-juan",
          githubUsernames: ["juan"],
          alumnoId: "alumno-1",
        },
        ESTUDIANTE
      );

      expect(mockEm.transactional).toHaveBeenCalled();
      expect(mockEm.findOne).toHaveBeenNthCalledWith(
        1,
        Assignment,
        { id: "a1" },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      expect(mockEm.persist).toHaveBeenCalled();
    });

    it("rechaza con AssignmentNoDisponibleError si el estado cambió bajo el lock y no es admin", async () => {
      mockEm.findOne.mockResolvedValueOnce(fakeAssignmentDisponible(false));

      await expect(
        crearEntregaSiAssignmentDisponible(
          {
            assignmentId: "a1",
            repoName: "kata-juan",
            repoUrl: "https://github.com/org/kata-juan",
            githubUsernames: ["juan"],
            alumnoId: "alumno-1",
          },
          ESTUDIANTE
        )
      ).rejects.toBeInstanceOf(AssignmentNoDisponibleError);

      expect(mockEm.persist).not.toHaveBeenCalled();
    });

    it("permite al admin crear la entrega aunque el assignment no esté disponible", async () => {
      mockEm.findOne
        .mockResolvedValueOnce(fakeAssignmentDisponible(false)) // lock del assignment
        .mockResolvedValueOnce(null) // repo lookup
        .mockResolvedValueOnce(null); // lógica lookup

      await expect(
        crearEntregaSiAssignmentDisponible(
          {
            assignmentId: "a1",
            repoName: "kata-juan",
            repoUrl: "https://github.com/org/kata-juan",
            githubUsernames: ["juan"],
            alumnoId: "alumno-1",
          },
          DOCENTE
        )
      ).resolves.toBeDefined();

      expect(mockEm.persist).toHaveBeenCalled();
    });
  });

  describe("actualizarCIDeEntrega", () => {
    it("escribe todos los campos cuando vienen con valores reales", async () => {
      const entrega = new Entrega();
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);
      const ejecutadoEn = new Date("2026-08-19T10:00:00Z");

      await actualizarCIDeEntrega("e1", {
        resultadoNombre: "passing",
        checkSuiteIds: ["111"],
        commitSha: "abc123",
        detalleUrl: "https://github.com/org/repo/commit/abc123/checks",
        ejecutadoEn,
      });

      expect(entrega.ciResultadoNombre).toBe("passing");
      expect(entrega.ciCheckSuiteIds).toEqual(["111"]);
      expect(entrega.ciCommitSha).toBe("abc123");
      expect(entrega.ciDetalleUrl).toBe("https://github.com/org/repo/commit/abc123/checks");
      expect(entrega.ciEjecutadoEn).toBe(ejecutadoEn);
    });

    it("preserva commitSha/detalleUrl/checkSuiteIds previos cuando el caller sólo manda resultadoNombre", async () => {
      const entrega = new Entrega();
      entrega.ciCheckSuiteIds = ["111"];
      entrega.ciCommitSha = "abc123";
      entrega.ciDetalleUrl = "https://github.com/org/repo/commit/abc123/checks";
      const ejecutadoEnPrevio = new Date("2026-08-19T10:00:00Z");
      entrega.ciEjecutadoEn = ejecutadoEnPrevio;
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      // Mismo llamado que hace reejecutarCIDeEntrega al pasar a "pendiente".
      await actualizarCIDeEntrega("e1", { resultadoNombre: "pendiente" });

      expect(entrega.ciResultadoNombre).toBe("pendiente");
      expect(entrega.ciCheckSuiteIds).toEqual(["111"]);
      expect(entrega.ciCommitSha).toBe("abc123");
      expect(entrega.ciDetalleUrl).toBe("https://github.com/org/repo/commit/abc123/checks");
      expect(entrega.ciEjecutadoEn).toBe(ejecutadoEnPrevio);
    });

    it("limpia los campos explícitamente cuando vienen en null", async () => {
      const entrega = new Entrega();
      entrega.ciCheckSuiteIds = ["111"];
      entrega.ciCommitSha = "abc123";
      entrega.ciDetalleUrl = "https://github.com/org/repo/commit/abc123/checks";
      entrega.ciEjecutadoEn = new Date("2026-08-19T10:00:00Z");
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await actualizarCIDeEntrega("e1", {
        resultadoNombre: "sin_ci",
        checkSuiteIds: null,
        commitSha: null,
        detalleUrl: null,
        ejecutadoEn: null,
      });

      expect(entrega.ciResultadoNombre).toBe("sin_ci");
      expect(entrega.ciCheckSuiteIds).toEqual([]);
      expect(entrega.ciCommitSha).toBeUndefined();
      expect(entrega.ciDetalleUrl).toBeUndefined();
      expect(entrega.ciEjecutadoEn).toBeUndefined();
    });
  });

  it("devuelve solo entregas activas que conservan repoName", async () => {
    const activa = new Entrega();
    activa.repoName = "tp-ana";
    mockEm.find.mockResolvedValue([activa]);

    await expect(getEntregasConRepoActivo("a1")).resolves.toEqual([activa]);
    expect(mockEm.find).toHaveBeenCalledWith(Entrega, {
      assignment: { id: "a1" },
      repoDeleted: false,
      provisionEstado: "activa",
      repoName: { $ne: null },
    });
  });

  // B2: antes filtraba sólo `repoDeleted`/`repoName`, sin `provisionEstado`
  // — una entrega `fallida` con `repoName` residual de un intento previo
  // (ver `Entrega.hasRepo()`) contaba para esta lista aunque no tuviera un
  // repo realmente activo. El filtro faltante se ve en el query pasado al
  // ORM: sin el fix, esta aserción falla porque `provisionEstado` no está.
  it("excluye una entrega con provisionEstado fallida aunque conserve repoName (B2)", async () => {
    mockEm.find.mockResolvedValue([]);

    await getEntregasConRepoActivo("a1");

    expect(mockEm.find).toHaveBeenCalledWith(
      Entrega,
      expect.objectContaining({ provisionEstado: "activa" })
    );
  });

  describe("getActiveRepoCountsByAssignment", () => {
    it("filtra por provisionEstado activa además de repoDeleted (B2)", async () => {
      mockEm.find.mockResolvedValue([]);

      await getActiveRepoCountsByAssignment();

      expect(mockEm.find).toHaveBeenCalledWith(
        Entrega,
        { repoDeleted: false, provisionEstado: "activa" },
        { fields: ["assignment", "repoName"] }
      );
    });

    it("cuenta sólo entregas con repoName entre las que devuelve el ORM", async () => {
      const conRepo = new Entrega();
      conRepo.assignment = { id: "a1" } as never;
      conRepo.repoName = "tp-ana";
      const sinRepoName = new Entrega();
      sinRepoName.assignment = { id: "a1" } as never;
      mockEm.find.mockResolvedValue([conRepo, sinRepoName]);

      const counts = await getActiveRepoCountsByAssignment();

      expect(counts.get("a1")).toBe(1);
    });
  });

  describe("conLockDeEntrega", () => {
    it("toma el advisory lock con la clave prefijada por 'ci:' y ejecuta la operación bajo la transacción", async () => {
      mockConnection.execute.mockResolvedValue(undefined);
      const operation = vi.fn().mockResolvedValue("resultado");

      await expect(conLockDeEntrega("e1", operation)).resolves.toBe("resultado");

      expect(mockEm.transactional).toHaveBeenCalled();
      expect(mockConnection.execute).toHaveBeenCalledWith(
        "select pg_advisory_xact_lock(hashtextextended(?, 0))",
        ["ci:e1"]
      );
      expect(operation).toHaveBeenCalled();
      expect(operation).toHaveBeenCalledWith(mockEm);
    });
  });

  describe("actualizarActividadDeEntrega", () => {
    it("persiste la actividad reciente del repo", async () => {
      const entrega = new Entrega();
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);
      const pusheadoEn = new Date("2026-08-19T10:00:00Z");

      await actualizarActividadDeEntrega("e1", {
        pusheadoEn,
        commitSha: "abc123",
        por: "juancito",
      });

      expect(entrega.ultimoPushEn).toBe(pusheadoEn);
      expect(entrega.ultimoPushSha).toBe("abc123");
      expect(entrega.ultimoPushPor).toBe("juancito");
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("no pisa un push más nuevo con uno más viejo (redelivery tardío)", async () => {
      const entrega = new Entrega();
      entrega.ultimoPushEn = new Date("2026-08-19T12:00:00Z");
      entrega.ultimoPushSha = "nuevo123";
      entrega.ultimoPushPor = "ana";
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await actualizarActividadDeEntrega("e1", {
        pusheadoEn: new Date("2026-08-19T10:00:00Z"),
        commitSha: "viejo123",
        por: "juancito",
      });

      expect(entrega.ultimoPushSha).toBe("nuevo123");
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it("escribe cuando no había ningún push previo", async () => {
      const entrega = new Entrega();
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await actualizarActividadDeEntrega("e1", {
        pusheadoEn: new Date("2026-08-19T10:00:00Z"),
        commitSha: "abc123",
        por: "juancito",
      });

      expect(entrega.ultimoPushSha).toBe("abc123");
    });
  });

  describe("marcarRepoBorrado", () => {
    it("marca repoDeleted en true", async () => {
      const entrega = new Entrega();
      entrega.repoDeleted = false;
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await marcarRepoBorrado("e1");

      expect(entrega.repoDeleted).toBe(true);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("guarda repoEventoActualizadoEn cuando se pasa una fecha", async () => {
      const entrega = new Entrega();
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);
      const eventoActualizadoEn = new Date("2026-08-19T10:00:00Z");

      await marcarRepoBorrado("e1", eventoActualizadoEn);

      expect(entrega.repoEventoActualizadoEn).toBe(eventoActualizadoEn);
    });

    it("no aplica un evento repository más viejo que el último ya aplicado (guard de orden)", async () => {
      const entrega = new Entrega();
      entrega.repoDeleted = false;
      entrega.repoEventoActualizadoEn = new Date("2026-08-19T12:00:00Z");
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await marcarRepoBorrado("e1", new Date("2026-08-19T10:00:00Z"));

      expect(entrega.repoDeleted).toBe(false);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it("SÍ aplica un delete con el mismo timestamp que el último rename ya aplicado (empate, no lo rechaza)", async () => {
      // `repository.updated_at` viaja en segundos: un rename y un delete del
      // mismo repo dentro del mismo segundo comparten timestamp. Con un
      // guard `>=`, el delete "empatado" se rechazaría por viejo y el repo
      // quedaría marcado como activo pese a haberse borrado — peor que
      // simplemente dejar ganar al que se procesó último en un empate real.
      const mismoInstante = new Date("2026-08-19T12:00:00Z");
      const entrega = new Entrega();
      entrega.repoDeleted = false;
      entrega.repoEventoActualizadoEn = mismoInstante; // el rename ya aplicado

      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await marcarRepoBorrado("e1", mismoInstante);

      expect(entrega.repoDeleted).toBe(true);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("sin fecha de guard (payload sin updated_at), aplica igual", async () => {
      const entrega = new Entrega();
      entrega.repoEventoActualizadoEn = new Date("2026-08-19T12:00:00Z");
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await marcarRepoBorrado("e1", undefined);

      expect(entrega.repoDeleted).toBe(true);
    });
  });

  describe("renombrarRepoDeEntrega", () => {
    it("reescribe repoName y repoUrl", async () => {
      const entrega = new Entrega();
      entrega.repoName = "kata-juan-viejo";
      entrega.repoUrl = "https://github.com/org/kata-juan-viejo";
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await renombrarRepoDeEntrega("e1", {
        repoName: "kata-juan-nuevo",
        repoUrl: "https://github.com/org/kata-juan-nuevo",
      });

      expect(entrega.repoName).toBe("kata-juan-nuevo");
      expect(entrega.repoUrl).toBe("https://github.com/org/kata-juan-nuevo");
    });

    it("no aplica un rename más viejo que el último evento repository ya aplicado (guard de orden)", async () => {
      const entrega = new Entrega();
      entrega.repoName = "C"; // ya aplicó el B→C más nuevo
      entrega.repoEventoActualizadoEn = new Date("2026-08-19T12:00:00Z");
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      // Llega tarde el A→B, más viejo que lo ya aplicado.
      await renombrarRepoDeEntrega("e1", {
        repoName: "B",
        repoUrl: "https://github.com/org/B",
        eventoActualizadoEn: new Date("2026-08-19T10:00:00Z"),
      });

      expect(entrega.repoName).toBe("C");
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });

  describe("getEntregaPorRepoGithubId", () => {
    it("busca por repoGithubId", async () => {
      const entrega = new Entrega();
      mockEm.findOne.mockResolvedValueOnce(entrega);

      await expect(getEntregaPorRepoGithubId("555")).resolves.toBe(entrega);

      expect(mockEm.findOne).toHaveBeenCalledWith(
        Entrega,
        { repoGithubId: "555" },
        { populate: ["assignment", "grupo", "alumno"] }
      );
    });
  });

  describe("asegurarRepoGithubId", () => {
    it("setea repoGithubId cuando todavía no estaba", async () => {
      const entrega = new Entrega();
      entrega.repoGithubId = undefined;
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await asegurarRepoGithubId("e1", "555");

      expect(entrega.repoGithubId).toBe("555");
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("no toca nada si repoGithubId ya estaba seteado", async () => {
      const entrega = new Entrega();
      entrega.repoGithubId = "555";
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await asegurarRepoGithubId("e1", "999");

      expect(entrega.repoGithubId).toBe("555");
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });

  describe("iniciarProvisionEntrega", () => {
    it("reclama y persiste el primer intento bajo lock", async () => {
      const entrega = new Entrega();
      entrega.provisionEstado = "pendiente";
      entrega.provisionIntentos = 0;
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await expect(iniciarProvisionEntrega("e1")).resolves.toBe(entrega);

      expect(entrega.provisionIntentos).toBe(1);
      expect(mockEm.findOneOrFail).toHaveBeenCalledWith(
        Entrega,
        { id: "e1" },
        expect.objectContaining({ lockMode: LockMode.PESSIMISTIC_WRITE })
      );
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("no reclama otra vez un intento reciente en vuelo", async () => {
      const entrega = new Entrega();
      entrega.provisionEstado = "pendiente";
      entrega.provisionIntentos = 1;
      entrega.provisionActualizadoEn = new Date();
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await expect(iniciarProvisionEntrega("e1")).resolves.toBeNull();

      expect(entrega.provisionIntentos).toBe(1);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it("reclama otra vez un intento vencido", async () => {
      const entrega = new Entrega();
      entrega.provisionEstado = "pendiente";
      entrega.provisionIntentos = 1;
      entrega.provisionActualizadoEn = new Date(Date.now() - 121_000);
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await expect(iniciarProvisionEntrega("e1")).resolves.toBe(entrega);

      expect(entrega.provisionIntentos).toBe(2);
      expect(mockEm.flush).toHaveBeenCalled();
    });
  });

  describe("marcarCreacionGithubIniciada", () => {
    it("persiste y devuelve la entrega con el timestamp estable", async () => {
      const entrega = new Entrega();
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await expect(marcarCreacionGithubIniciada("e1")).resolves.toBe(entrega);

      expect(entrega.provisionCreacionIniciadaEn).toBeInstanceOf(Date);
      expect(mockEm.flush).toHaveBeenCalledOnce();
    });
  });

  describe("actualizarColaboradoresDeEntrega", () => {
    it("agrega un colaborador nuevo", async () => {
      const entrega = new Entrega();
      entrega.githubUsernames = ["juan"];
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await actualizarColaboradoresDeEntrega("e1", { agregar: "ana" });

      expect(entrega.githubUsernames).toEqual(["juan", "ana"]);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("no duplica un colaborador que ya estaba (case insensitive)", async () => {
      const entrega = new Entrega();
      entrega.githubUsernames = ["Juan"];
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await actualizarColaboradoresDeEntrega("e1", { agregar: "juan" });

      expect(entrega.githubUsernames).toEqual(["Juan"]);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it("quita un colaborador existente (case insensitive)", async () => {
      const entrega = new Entrega();
      entrega.githubUsernames = ["Juan", "ana"];
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await actualizarColaboradoresDeEntrega("e1", { quitar: "juan" });

      expect(entrega.githubUsernames).toEqual(["ana"]);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("quitar un username que no está no rompe nada", async () => {
      const entrega = new Entrega();
      entrega.githubUsernames = ["ana"];
      mockEm.findOneOrFail.mockResolvedValueOnce(entrega);

      await actualizarColaboradoresDeEntrega("e1", { quitar: "juan" });

      expect(entrega.githubUsernames).toEqual(["ana"]);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });
});
