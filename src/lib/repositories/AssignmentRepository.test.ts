import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  persist: vi.fn(),
  flush: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

import {
  ComisionActivaRequeridaError,
  createAssignment,
  getAssignment,
  getAssignments,
  getAssignmentsDeComision,
} from "./AssignmentRepository";
import { Assignment, Comision } from "@/domain/entities";

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
    mockEm.flush.mockResolvedValue(undefined);
  });

  describe("getAssignmentsDeComision", () => {
    it("busca assignments por comisión ordenados por fecha descendente", async () => {
      await getAssignmentsDeComision("c1");

      expect(mockEm.find).toHaveBeenCalledWith(
        Assignment,
        { comision: { id: "c1" } },
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
  });
});
