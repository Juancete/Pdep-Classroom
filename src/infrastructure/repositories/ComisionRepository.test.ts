import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTx = {
  findOne: vi.fn(),
  count: vi.fn(),
  nativeUpdate: vi.fn(),
  persist: vi.fn(),
  remove: vi.fn(),
  flush: vi.fn(),
};

const mockEm = {
  findOne: vi.fn(),
  nativeUpdate: vi.fn(),
  persist: vi.fn(),
  flush: vi.fn(),
  transactional: vi.fn(async (callback: (transaction: typeof mockTx) => Promise<unknown>) =>
    callback(mockTx)
  ),
};

vi.mock("@/infrastructure/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

import {
  createComision,
  updateComision,
  deleteComision,
  reclamarImportacionGrupos,
  renovarImportacionGrupos,
  completarImportacionGrupos,
  liberarImportacionGrupos,
  ComisionActivaDuplicadaError,
  ComisionNoEliminableError,
} from "./ComisionRepository";
import { Comision } from "@/domain/entities";

function uniqueActiveComisionError(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "comision_unica_activa_idx"'),
    { code: "23505" }
  );
}

describe("ComisionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.count.mockResolvedValue(0);
    mockEm.transactional.mockImplementation(
      async (callback: (transaction: typeof mockTx) => Promise<unknown>) =>
        callback(mockTx)
    );
  });

  describe("createComision", () => {
    it("crea sin transacción cuando no se marca como activa", async () => {
      const comision = await createComision({
        anio: 2026,
        spreadsheetId: "sheet-1",
        activa: false,
      });

      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(mockEm.nativeUpdate).not.toHaveBeenCalled();
      expect(mockEm.persist).toHaveBeenCalledWith(comision);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(comision.activa).toBe(false);
    });

    it("si activa=true, desactiva las demás y persiste dentro de una transacción", async () => {
      const comision = await createComision({
        anio: 2026,
        spreadsheetId: "sheet-1",
        activa: true,
      });

      expect(mockEm.transactional).toHaveBeenCalledOnce();
      expect(mockTx.nativeUpdate).toHaveBeenCalledWith(Comision, {}, { activa: false });
      expect(mockTx.persist).toHaveBeenCalledWith(comision);
      expect(mockTx.flush).toHaveBeenCalled();
      expect(comision.activa).toBe(true);
    });

    it("traduce la violación del índice único de comisión activa", async () => {
      mockTx.flush.mockRejectedValueOnce(uniqueActiveComisionError());

      await expect(
        createComision({ anio: 2026, spreadsheetId: "sheet-1", activa: true })
      ).rejects.toBeInstanceOf(ComisionActivaDuplicadaError);
    });
  });

  describe("updateComision", () => {
    it("actualiza sin transacción cuando no se marca como activa", async () => {
      const comision = new Comision(2025, "sheet-old");
      mockEm.findOne.mockResolvedValueOnce(comision);

      const result = await updateComision("c1", {
        anio: 2026,
        spreadsheetId: "sheet-new",
        activa: false,
      });

      expect(result).toBe(comision);
      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(mockEm.nativeUpdate).not.toHaveBeenCalled();
      expect(mockEm.flush).toHaveBeenCalled();
      expect(comision.anio).toBe(2026);
      expect(comision.spreadsheetId).toBe("sheet-new");
      expect(comision.activa).toBe(false);
    });

    it("si activa=true, desactiva las demás y actualiza dentro de una transacción", async () => {
      const comision = new Comision(2025, "sheet-old");
      mockTx.findOne.mockResolvedValueOnce(comision);

      const result = await updateComision("c1", {
        anio: 2026,
        spreadsheetId: "sheet-new",
        activa: true,
      });

      expect(result).toBe(comision);
      expect(mockEm.transactional).toHaveBeenCalledOnce();
      expect(mockTx.findOne).toHaveBeenCalledWith(Comision, { id: "c1" });
      expect(mockTx.nativeUpdate).toHaveBeenCalledWith(
        Comision,
        { id: { $ne: "c1" } },
        { activa: false }
      );
      expect(mockTx.flush).toHaveBeenCalled();
      expect(comision.anio).toBe(2026);
      expect(comision.spreadsheetId).toBe("sheet-new");
      expect(comision.activa).toBe(true);
    });

    it("traduce la violación del índice único de comisión activa", async () => {
      mockTx.findOne.mockResolvedValueOnce(new Comision(2025, "sheet-old"));
      mockTx.flush.mockRejectedValueOnce(uniqueActiveComisionError());

      await expect(
        updateComision("c1", { anio: 2026, spreadsheetId: "sheet-1", activa: true })
      ).rejects.toBeInstanceOf(ComisionActivaDuplicadaError);
    });
  });

  describe("deleteComision", () => {
    it("elimina una comisión inactiva y vacía", async () => {
      const comision = new Comision(2025, "sheet-old");
      mockTx.findOne.mockResolvedValueOnce(comision);

      await deleteComision("c1");

      expect(mockTx.remove).toHaveBeenCalledWith(comision);
      expect(mockTx.flush).toHaveBeenCalled();
    });

    it("no elimina la comisión activa", async () => {
      const comision = new Comision(2026, "sheet-current");
      comision.activa = true;
      mockTx.findOne.mockResolvedValueOnce(comision);

      await expect(deleteComision("c1")).rejects.toBeInstanceOf(
        ComisionNoEliminableError
      );

      expect(mockTx.remove).not.toHaveBeenCalled();
    });

    it("no elimina una comisión histórica con alumnos", async () => {
      mockTx.findOne.mockResolvedValueOnce(new Comision(2025, "sheet-old"));
      mockTx.count.mockResolvedValueOnce(1);

      await expect(deleteComision("c1")).rejects.toMatchObject({ motivo: "alumnos" });

      expect(mockTx.remove).not.toHaveBeenCalled();
    });
  });

  describe("lease de importación de grupos", () => {
    it("reclama atómicamente una comisión disponible", async () => {
      const comision = new Comision(2026, "sheet-1");
      mockTx.findOne.mockResolvedValueOnce(comision);

      const result = await reclamarImportacionGrupos("c1");

      expect(result).toMatchObject({
        estado: "reclamada",
        comision,
        token: expect.any(String),
      });
      expect(comision.gruposImportacionToken).toEqual(expect.any(String));
      expect(comision.gruposImportacionIniciadaEn).toBeInstanceOf(Date);
      expect(mockTx.flush).toHaveBeenCalledOnce();
    });

    it("rechaza un segundo reclamo mientras el lease sigue vigente", async () => {
      const comision = new Comision(2026, "sheet-1");
      comision.gruposImportacionToken = "lease-activo";
      comision.gruposImportacionIniciadaEn = new Date();
      mockTx.findOne.mockResolvedValueOnce(comision);

      await expect(reclamarImportacionGrupos("c1")).resolves.toEqual({
        estado: "en_proceso",
      });
      expect(mockTx.flush).not.toHaveBeenCalled();
    });

    it("recupera un lease vencido", async () => {
      const comision = new Comision(2026, "sheet-1");
      comision.gruposImportacionToken = "lease-vencido";
      comision.gruposImportacionIniciadaEn = new Date(Date.now() - 301_000);
      mockTx.findOne.mockResolvedValueOnce(comision);

      const result = await reclamarImportacionGrupos("c1");

      expect(result).toMatchObject({ estado: "reclamada", token: expect.any(String) });
      expect(comision.gruposImportacionToken).not.toBe("lease-vencido");
      expect(mockTx.flush).toHaveBeenCalledOnce();
    });

    it("solo completa la importación del dueño del lease", async () => {
      const comision = new Comision(2026, "sheet-1");
      comision.gruposImportacionToken = "lease-1";
      comision.gruposImportacionIniciadaEn = new Date();
      mockTx.findOne.mockResolvedValueOnce(comision);

      await expect(completarImportacionGrupos("c1", "lease-ajeno")).resolves.toBe(false);
      expect(comision.gruposImportadosEn).toBeUndefined();
      expect(mockTx.flush).not.toHaveBeenCalled();

      mockTx.findOne.mockResolvedValueOnce(comision);
      await expect(completarImportacionGrupos("c1", "lease-1")).resolves.toBe(true);
      expect(comision.gruposImportadosEn).toBeInstanceOf(Date);
      expect(comision.gruposImportacionToken).toBeUndefined();
      expect(comision.gruposImportacionIniciadaEn).toBeUndefined();
      expect(mockTx.flush).toHaveBeenCalledOnce();
    });

    it("renueva el heartbeat únicamente para el dueño del lease", async () => {
      const comision = new Comision(2026, "sheet-1");
      const inicioAnterior = new Date(Date.now() - 60_000);
      comision.gruposImportacionToken = "lease-1";
      comision.gruposImportacionIniciadaEn = inicioAnterior;
      mockTx.findOne.mockResolvedValueOnce(comision);

      await expect(renovarImportacionGrupos("c1", "lease-ajeno")).resolves.toBe(false);
      expect(comision.gruposImportacionIniciadaEn).toBe(inicioAnterior);
      expect(mockTx.flush).not.toHaveBeenCalled();

      mockTx.findOne.mockResolvedValueOnce(comision);
      await expect(renovarImportacionGrupos("c1", "lease-1")).resolves.toBe(true);
      expect(comision.gruposImportacionIniciadaEn).not.toBe(inicioAnterior);
      expect(mockTx.flush).toHaveBeenCalledOnce();
    });

    it("libera un lease fallido para permitir reintentos", async () => {
      const comision = new Comision(2026, "sheet-1");
      comision.gruposImportacionToken = "lease-1";
      comision.gruposImportacionIniciadaEn = new Date();
      mockTx.findOne.mockResolvedValueOnce(comision);

      await liberarImportacionGrupos("c1", "lease-1");

      expect(comision.gruposImportacionToken).toBeUndefined();
      expect(comision.gruposImportacionIniciadaEn).toBeUndefined();
      expect(mockTx.flush).toHaveBeenCalledOnce();
    });
  });
});
