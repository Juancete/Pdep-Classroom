import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConnection = { execute: vi.fn() };

const mockEm = {
  find: vi.fn(),
  findOneOrFail: vi.fn(),
  persist: vi.fn(),
  flush: vi.fn(),
  getConnection: vi.fn(() => mockConnection),
};

vi.mock("@/lib/db", () => ({
  getEM: vi.fn(async () => mockEm),
}));

import { GithubWebhookDelivery } from "@/domain/entities";
import {
  registrarDelivery,
  reclamarDeliveryPorId,
  reclamarDeliveryPorDeliveryId,
  cerrarDelivery,
  fallarDelivery,
  getDeliveriesReprocesables,
  DeliveryDuplicadoError,
} from "./GithubWebhookDeliveryRepository";

describe("GithubWebhookDeliveryRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEm.flush.mockResolvedValue(undefined);
  });

  describe("registrarDelivery", () => {
    it("persiste la fila con los datos recibidos", async () => {
      const delivery = await registrarDelivery({
        deliveryId: "delivery-1",
        evento: "push",
        accion: undefined,
        repoName: "kata-juan",
        payload: { a: 1 },
      });

      expect(mockEm.persist).toHaveBeenCalled();
      expect(delivery.deliveryId).toBe("delivery-1");
      expect(delivery.evento).toBe("push");
      expect(delivery.repoName).toBe("kata-juan");
      expect(delivery.payload).toEqual({ a: 1 });
    });

    it("traduce una violación del índice único a DeliveryDuplicadoError", async () => {
      const duplicate = new Error("duplicate key value violates unique constraint");
      (duplicate as NodeJS.ErrnoException).code = "23505";
      mockEm.flush.mockRejectedValueOnce(duplicate);

      await expect(
        registrarDelivery({
          deliveryId: "delivery-1",
          evento: "push",
          payload: {},
        })
      ).rejects.toBeInstanceOf(DeliveryDuplicadoError);
    });

    it("propaga cualquier otro error de flush sin traducir", async () => {
      mockEm.flush.mockRejectedValueOnce(new Error("DB caída"));

      await expect(
        registrarDelivery({ deliveryId: "delivery-1", evento: "push", payload: {} })
      ).rejects.toThrow("DB caída");
    });
  });

  describe("reclamarDeliveryPorId / reclamarDeliveryPorDeliveryId", () => {
    it("devuelve la fila reclamada cuando el UPDATE afecta una fila", async () => {
      mockConnection.execute.mockResolvedValueOnce([
        { id: "row-1", deliveryId: "delivery-1", evento: "push", payload: { a: 1 } },
      ]);

      await expect(reclamarDeliveryPorId("row-1")).resolves.toEqual({
        id: "row-1",
        deliveryId: "delivery-1",
        evento: "push",
        payload: { a: 1 },
      });

      const [sql, params] = mockConnection.execute.mock.calls[0]!;
      expect(sql).toContain(`set "estado_procesamiento" = 'procesando', "intentos" = "intentos" + 1, "reclamado_en" = now()`);
      expect(sql).toContain(`"id" = ?`);
      // El lease se mide contra `reclamado_en`, no `recibido_en` — un
      // delivery `fallido` puede tener `recibido_en` de hace horas.
      expect(sql).toContain(`"reclamado_en" < now()`);
      expect(sql).not.toMatch(/"estado_procesamiento" = 'procesando'\s+and "recibido_en"/);
      expect(sql).toContain(`returning "id", "delivery_id" as "deliveryId", "evento", "payload"`);
      expect(params).toEqual(["row-1", 120_000]);
    });

    it("devuelve null cuando el UPDATE no afecta ninguna fila (ya reclamada o terminal)", async () => {
      mockConnection.execute.mockResolvedValueOnce([]);
      await expect(reclamarDeliveryPorId("row-1")).resolves.toBeNull();
    });

    it("reclamarDeliveryPorDeliveryId filtra por delivery_id en vez de id", async () => {
      mockConnection.execute.mockResolvedValueOnce([
        { id: "row-1", deliveryId: "delivery-1", evento: "push", payload: null },
      ]);

      await reclamarDeliveryPorDeliveryId("delivery-1");

      const [sql, params] = mockConnection.execute.mock.calls[0]!;
      expect(sql).toContain(`"delivery_id" = ?`);
      expect(params).toEqual(["delivery-1", 120_000]);
    });
  });

  describe("cerrarDelivery", () => {
    it("cierra en procesado y limpia el payload", async () => {
      const delivery = new GithubWebhookDelivery();
      delivery.payload = { a: 1 };
      mockEm.findOneOrFail.mockResolvedValueOnce(delivery);

      await cerrarDelivery("row-1", { estadoNombre: "procesado", entregaId: "e1" });

      expect(delivery.estadoProcesamiento).toBe("procesado");
      expect(delivery.entregaId).toBe("e1");
      expect(delivery.payload).toBeNull();
      expect(delivery.error).toBeUndefined();
      expect(delivery.procesadoEn).toBeInstanceOf(Date);
    });

    it("cierra en ignorado sin entregaId", async () => {
      const delivery = new GithubWebhookDelivery();
      mockEm.findOneOrFail.mockResolvedValueOnce(delivery);

      await cerrarDelivery("row-1", { estadoNombre: "ignorado" });

      expect(delivery.estadoProcesamiento).toBe("ignorado");
      expect(delivery.entregaId).toBeUndefined();
    });
  });

  describe("fallarDelivery", () => {
    it("cierra en fallido conservando el payload", async () => {
      const delivery = new GithubWebhookDelivery();
      delivery.payload = { a: 1 };
      mockEm.findOneOrFail.mockResolvedValueOnce(delivery);

      await fallarDelivery("row-1", "timeout de GitHub");

      expect(delivery.estadoProcesamiento).toBe("fallido");
      expect(delivery.error).toBe("timeout de GitHub");
      expect(delivery.payload).toEqual({ a: 1 });
    });
  });

  describe("getDeliveriesReprocesables", () => {
    it("consulta por los estados reprocesables (incluido procesando huérfano) ordenados del más viejo al más nuevo, y devuelve sólo ids", async () => {
      mockEm.find.mockResolvedValue([{ id: "row-1" }, { id: "row-2" }]);

      await expect(getDeliveriesReprocesables()).resolves.toEqual(["row-1", "row-2"]);

      expect(mockEm.find).toHaveBeenCalledWith(
        GithubWebhookDelivery,
        {
          $or: [
            { estadoProcesamiento: { $in: ["recibido", "fallido"] } },
            {
              estadoProcesamiento: "procesando",
              reclamadoEn: { $lt: expect.any(Date) },
            },
          ],
        },
        { orderBy: { recibidoEn: "asc" }, limit: 50, fields: ["id"] }
      );
    });

    it("filtra por deliveryId cuando se especifica uno", async () => {
      mockEm.find.mockResolvedValue([]);

      await getDeliveriesReprocesables("delivery-1");

      const [, where] = mockEm.find.mock.calls[0]!;
      expect(where).toMatchObject({ deliveryId: "delivery-1" });
      expect(where.$or).toBeDefined();
    });
  });
});
