import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEm: {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  findOneOrFail: ReturnType<typeof vi.fn>;
  getReference: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  transactional: ReturnType<typeof vi.fn>;
} = {
  find: vi.fn(),
  findOne: vi.fn(),
  findOneOrFail: vi.fn(),
  getReference: vi.fn(),
  persist: vi.fn(),
  flush: vi.fn(),
  transactional: vi.fn(),
};
mockEm.transactional.mockImplementation(
  async (callback: (transaction: typeof mockEm) => unknown) => callback(mockEm)
);

vi.mock("@/lib/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

import { LockMode } from "@mikro-orm/core";
import { Alumno, Assignment, Entrega, Grupo, DOCENTE, ESTUDIANTE } from "@/domain/entities";
import { AssignmentNoDisponibleError } from "@/lib/services/assignmentAuthorization";
import {
  createEntrega,
  createOrGetEntrega,
  crearEntregaSiAssignmentDisponible,
  getEntregasConRepoActivo,
  getEntregaLogica,
  actualizarCIDeEntrega,
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
      repoName: { $ne: null },
    });
  });
});
