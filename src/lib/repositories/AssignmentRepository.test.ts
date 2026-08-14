import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEm: {
  find: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  transactional: ReturnType<typeof vi.fn>;
} = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
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

import {
  cambiarEstadoAssignment,
  ComisionActivaRequeridaError,
  createAssignment,
  getAssignment,
  getAssignments,
  getAssignmentsDeComision,
} from "./AssignmentRepository";
import { Assignment, Comision, IndividualAssignment } from "@/domain/entities";
import { LockMode } from "@mikro-orm/core";
import { AssignmentNoEncontradoError } from "@/lib/services/assignmentAuthorization";
import { TransicionDeEstadoInvalidaError } from "@/domain/entities/EstadoAssignment";

const assignmentData = {
  titulo: "Kata Funcional",
  slug: "",
  descripcion: "",
  templateRepo: "kata-template",
  tipo: "individual" as const,
  paradigma: "funcional",
  deadline: "",
};

describe("AssignmentRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEm.find.mockResolvedValue([]);
    mockEm.findOne.mockResolvedValue(new Comision(2026, "sheet-1"));
    mockEm.count.mockResolvedValue(0);
    mockEm.flush.mockResolvedValue(undefined);
  });

  describe("getAssignmentsDeComision", () => {
    it("busca assignments publicados o archivados de la comisión, ordenados por fecha descendente", async () => {
      await getAssignmentsDeComision("c1");

      expect(mockEm.find).toHaveBeenCalledWith(
        Assignment,
        {
          comision: { id: "c1" },
          estadoNombre: { $in: ["publicado", "archivado"] },
        },
        { orderBy: { createdAt: "DESC" } }
      );
    });
  });

  describe("getAssignments", () => {
    it("popula comisión y ordena por fecha descendente", async () => {
      await getAssignments();

      expect(mockEm.find).toHaveBeenCalledWith(
        Assignment,
        {},
        { orderBy: { createdAt: "DESC" }, populate: ["comision"] }
      );
    });

    it("filtra por estado cuando se pide explícitamente", async () => {
      await getAssignments({ estado: "borrador" });

      expect(mockEm.find).toHaveBeenCalledWith(
        Assignment,
        { estadoNombre: "borrador" },
        { orderBy: { createdAt: "DESC" }, populate: ["comision"] }
      );
    });
  });

  describe("getAssignment", () => {
    it("popula la comisión asociada", async () => {
      await getAssignment("a1");

      expect(mockEm.findOne).toHaveBeenCalledWith(
        Assignment,
        { id: "a1" },
        { populate: ["comision"] }
      );
    });
  });

  describe("createAssignment", () => {
    it("asocia el assignment a la comisión activa", async () => {
      const comision = new Comision(2026, "sheet-1");
      mockEm.findOne.mockResolvedValueOnce(comision);

      const assignment = await createAssignment(assignmentData);

      expect(mockEm.findOne).toHaveBeenCalledWith(Comision, { activa: true });
      expect(assignment.comision).toBe(comision);
      expect(mockEm.persist).toHaveBeenCalledWith(assignment);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("falla si no hay comisión activa", async () => {
      mockEm.findOne.mockResolvedValueOnce(null);

      await expect(createAssignment(assignmentData)).rejects.toBeInstanceOf(
        ComisionActivaRequeridaError
      );

      expect(mockEm.persist).not.toHaveBeenCalled();
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it("nace en estado borrador", async () => {
      const comision = new Comision(2026, "sheet-1");
      mockEm.findOne.mockResolvedValueOnce(comision);

      const assignment = await createAssignment(assignmentData);

      expect(assignment.estadoNombre).toBe("borrador");
    });
  });

  describe("cambiarEstadoAssignment", () => {
    function fakeAssignment(): Assignment {
      const assignment = new IndividualAssignment();
      assignment.id = "a1";
      return assignment;
    }

    it("publica un assignment en borrador y sella la auditoría", async () => {
      mockEm.findOne.mockResolvedValueOnce(fakeAssignment());
      mockEm.count.mockResolvedValueOnce(0);

      const assignment = await cambiarEstadoAssignment("a1", "publicado", "docente1");

      expect(assignment.estadoNombre).toBe("publicado");
      expect(assignment.publicadoPor).toBe("docente1");
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it("corre dentro de una transacción y bloquea el assignment con PESSIMISTIC_WRITE", async () => {
      mockEm.findOne.mockResolvedValueOnce(fakeAssignment());
      mockEm.count.mockResolvedValueOnce(0);

      await cambiarEstadoAssignment("a1", "publicado", "docente1");

      expect(mockEm.transactional).toHaveBeenCalled();
      expect(mockEm.findOne).toHaveBeenCalledWith(
        Assignment,
        { id: "a1" },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );
    });

    it("lanza AssignmentNoEncontradoError si no existe", async () => {
      mockEm.findOne.mockResolvedValueOnce(null);

      await expect(
        cambiarEstadoAssignment("a1", "publicado", "docente1")
      ).rejects.toBeInstanceOf(AssignmentNoEncontradoError);
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it("rechaza despublicar con entregas y no persiste el cambio", async () => {
      const publicado = fakeAssignment();
      publicado.transicionarA("publicado", { tieneEntregas: false }, "docente1");
      mockEm.findOne.mockResolvedValueOnce(publicado);
      mockEm.count.mockResolvedValueOnce(3);

      await expect(
        cambiarEstadoAssignment("a1", "borrador", "docente1")
      ).rejects.toBeInstanceOf(TransicionDeEstadoInvalidaError);

      expect(publicado.estadoNombre).toBe("publicado");
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });
});
