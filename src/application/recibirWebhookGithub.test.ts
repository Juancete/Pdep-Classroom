import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegistrarDelivery = vi.fn();
const mockReclamarPorId = vi.fn();
const mockReclamarPorDeliveryId = vi.fn();
const mockCerrarDelivery = vi.fn();
const mockFallarDelivery = vi.fn();
const mockGetDeliveriesReprocesables = vi.fn();
const mockProcesarEventoGithub = vi.fn();

const { DeliveryDuplicadoErrorFake, mockLoggerError } = vi.hoisted(() => ({
  DeliveryDuplicadoErrorFake: class extends Error {
    deliveryId: string;
    constructor(deliveryId: string) {
      super(`El delivery ${deliveryId} ya fue recibido`);
      this.deliveryId = deliveryId;
    }
  },
  mockLoggerError: vi.fn(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  registrarDelivery: (...args: unknown[]) => mockRegistrarDelivery(...args),
  reclamarDeliveryPorId: (...args: unknown[]) => mockReclamarPorId(...args),
  reclamarDeliveryPorDeliveryId: (...args: unknown[]) => mockReclamarPorDeliveryId(...args),
  cerrarDelivery: (...args: unknown[]) => mockCerrarDelivery(...args),
  fallarDelivery: (...args: unknown[]) => mockFallarDelivery(...args),
  getDeliveriesReprocesables: (...args: unknown[]) => mockGetDeliveriesReprocesables(...args),
  DeliveryDuplicadoError: DeliveryDuplicadoErrorFake,
}));

vi.mock("./procesarEventoGithub", () => ({
  procesarEventoGithub: (...args: unknown[]) => mockProcesarEventoGithub(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mockLoggerError },
}));

import {
  reclamarDeliveryEntrante,
  procesarDeliveryReclamado,
  reprocesarDeliveries,
} from "./recibirWebhookGithub";

describe("reclamarDeliveryEntrante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra el delivery, lo reclama y devuelve 'aceptado' sin aplicar el efecto todavía", async () => {
    mockRegistrarDelivery.mockResolvedValue({ id: "row-1" });
    mockReclamarPorId.mockResolvedValue({
      id: "row-1",
      deliveryId: "delivery-1",
      evento: "push",
      payload: { repository: { name: "kata-juan" } },
    });

    const resultado = await reclamarDeliveryEntrante({
      deliveryId: "delivery-1",
      evento: "push",
      payload: { repository: { name: "kata-juan" } },
    });

    expect(resultado).toEqual({
      tipo: "aceptado",
      delivery: {
        id: "row-1",
        deliveryId: "delivery-1",
        evento: "push",
        payload: { repository: { name: "kata-juan" } },
      },
    });
    expect(mockRegistrarDelivery).toHaveBeenCalledWith({
      deliveryId: "delivery-1",
      evento: "push",
      accion: undefined,
      repoName: "kata-juan",
      payload: { repository: { name: "kata-juan" } },
    });
    expect(mockReclamarPorId).toHaveBeenCalledWith("row-1");
    expect(mockReclamarPorDeliveryId).not.toHaveBeenCalled();
    // El efecto (procesarEventoGithub) NO se aplica en esta función — lo
    // dispara el caller (el route handler) vía `after()`, después de
    // responder, para no bloquear la respuesta con llamadas a GitHub.
    expect(mockProcesarEventoGithub).not.toHaveBeenCalled();
  });

  it("si el reclamo tras insertar no gana nada (carrera rarísima), devuelve duplicado", async () => {
    mockRegistrarDelivery.mockResolvedValue({ id: "row-1" });
    mockReclamarPorId.mockResolvedValue(null);

    const resultado = await reclamarDeliveryEntrante({
      deliveryId: "delivery-1",
      evento: "push",
      payload: {},
    });

    expect(resultado).toEqual({ tipo: "duplicado" });
  });

  it("ante un delivery repetido (índice único), reclama la fila existente por deliveryId", async () => {
    mockRegistrarDelivery.mockRejectedValue(new DeliveryDuplicadoErrorFake("delivery-1"));
    mockReclamarPorDeliveryId.mockResolvedValue({
      id: "row-1",
      deliveryId: "delivery-1",
      evento: "push",
      payload: { repository: { name: "kata-juan" } },
    });

    const resultado = await reclamarDeliveryEntrante({
      deliveryId: "delivery-1",
      evento: "push",
      payload: {},
    });

    expect(mockReclamarPorDeliveryId).toHaveBeenCalledWith("delivery-1");
    expect(resultado).toEqual({
      tipo: "aceptado",
      delivery: {
        id: "row-1",
        deliveryId: "delivery-1",
        evento: "push",
        payload: { repository: { name: "kata-juan" } },
      },
    });
  });

  it("ante un delivery repetido ya terminal (procesado/ignorado), el reclamo no gana nada y devuelve duplicado", async () => {
    mockRegistrarDelivery.mockRejectedValue(new DeliveryDuplicadoErrorFake("delivery-1"));
    mockReclamarPorDeliveryId.mockResolvedValue(null);

    const resultado = await reclamarDeliveryEntrante({
      deliveryId: "delivery-1",
      evento: "push",
      payload: {},
    });

    expect(resultado).toEqual({ tipo: "duplicado" });
  });

  it("propaga un error de registro que no sea de duplicado", async () => {
    mockRegistrarDelivery.mockRejectedValue(new Error("DB caída"));

    await expect(
      reclamarDeliveryEntrante({ deliveryId: "delivery-1", evento: "push", payload: {} })
    ).rejects.toThrow("DB caída");
  });

  it("extrae accion y repoName del payload cuando están presentes", async () => {
    mockRegistrarDelivery.mockResolvedValue({ id: "row-1" });
    mockReclamarPorId.mockResolvedValue({
      id: "row-1",
      deliveryId: "delivery-1",
      evento: "repository",
      payload: {},
    });

    await reclamarDeliveryEntrante({
      deliveryId: "delivery-1",
      evento: "repository",
      payload: { action: "deleted", repository: { name: "kata-juan" } },
    });

    expect(mockRegistrarDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ accion: "deleted", repoName: "kata-juan" })
    );
  });
});

describe("procesarDeliveryReclamado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aplica el efecto y cierra en el estado que devuelve procesarEventoGithub", async () => {
    mockProcesarEventoGithub.mockResolvedValue({ estado: "procesado", entregaId: "e1" });

    const resultado = await procesarDeliveryReclamado({
      id: "row-1",
      deliveryId: "delivery-1",
      evento: "push",
      payload: { a: 1 },
    });

    expect(resultado).toEqual({ tipo: "cerrado", estado: "procesado" });
    expect(mockProcesarEventoGithub).toHaveBeenCalledWith("push", { a: 1 });
    expect(mockCerrarDelivery).toHaveBeenCalledWith("row-1", {
      estadoNombre: "procesado",
      entregaId: "e1",
    });
  });

  it("cierra en fallido, conserva el mensaje redactado y nunca tira (es fire-and-forget desde after())", async () => {
    mockProcesarEventoGithub.mockRejectedValue(
      new Error("GitHub rechazó token=github_pat_secreto123")
    );

    const resultado = await procesarDeliveryReclamado({
      id: "row-1",
      deliveryId: "delivery-1",
      evento: "check_suite",
      payload: {},
    });

    expect(resultado).toEqual({
      tipo: "fallido",
      error: "GitHub rechazó token=[REDACTED]",
    });
    expect(mockFallarDelivery).toHaveBeenCalledWith("row-1", "GitHub rechazó token=[REDACTED]");
    expect(mockCerrarDelivery).not.toHaveBeenCalled();
  });

  it("loguea el X-GitHub-Delivery real, no el id interno de la fila", async () => {
    mockProcesarEventoGithub.mockRejectedValue(new Error("timeout de GitHub"));

    await procesarDeliveryReclamado({
      id: "fila-uuid-interna",
      deliveryId: "delivery-real-de-github",
      evento: "check_suite",
      payload: {},
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: "delivery-real-de-github",
        filaId: "fila-uuid-interna",
      }),
      "No se pudo procesar el evento de webhook de GitHub"
    );
  });

  it("si fallarDelivery también falla, igual resuelve 'fallido' (no deja una promesa rechazada) y loguea el segundo error aparte", async () => {
    mockProcesarEventoGithub.mockRejectedValue(new Error("timeout de GitHub"));
    mockFallarDelivery.mockRejectedValueOnce(new Error("DB sigue caída"));

    const resultado = await procesarDeliveryReclamado({
      id: "row-1",
      deliveryId: "delivery-1",
      evento: "check_suite",
      payload: {},
    });

    expect(resultado).toEqual({ tipo: "fallido", error: "timeout de GitHub" });
    // El log del fallo original de procesarEventoGithub sigue ocurriendo...
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: "timeout de GitHub", deliveryId: "delivery-1" }),
      "No se pudo procesar el evento de webhook de GitHub"
    );
    // ...y el fallo de fallarDelivery se loguea aparte, no se pierde.
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: "DB sigue caída", deliveryId: "delivery-1" }),
      "No se pudo persistir el fallo del delivery — queda 'procesando' hasta que venza el lease"
    );
  });
});

describe("reprocesarDeliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reclama cada id candidato y reprocesa lo que efectivamente ganó el reclamo", async () => {
    mockGetDeliveriesReprocesables.mockResolvedValue(["row-1", "row-2"]);
    mockReclamarPorId
      .mockResolvedValueOnce({ id: "row-1", deliveryId: "delivery-1", evento: "push", payload: { a: 1 } })
      .mockResolvedValueOnce({
        id: "row-2",
        deliveryId: "delivery-2",
        evento: "check_suite",
        payload: { b: 2 },
      });
    mockProcesarEventoGithub
      .mockResolvedValueOnce({ estado: "procesado" })
      .mockRejectedValueOnce(new Error("timeout"));

    const resultado = await reprocesarDeliveries();

    expect(resultado).toEqual({ reprocesados: 2, cerrados: 1, fallidos: 1 });
    expect(mockCerrarDelivery).toHaveBeenCalledWith("row-1", {
      estadoNombre: "procesado",
      entregaId: undefined,
    });
    expect(mockFallarDelivery).toHaveBeenCalledWith("row-2", "timeout");
  });

  it("un candidato que no se pudo reclamar (otro proceso ganó primero) no cuenta como reprocesado", async () => {
    mockGetDeliveriesReprocesables.mockResolvedValue(["row-1", "row-2"]);
    mockReclamarPorId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "row-2", deliveryId: "delivery-2", evento: "push", payload: {} });
    mockProcesarEventoGithub.mockResolvedValueOnce({ estado: "ignorado" });

    const resultado = await reprocesarDeliveries();

    expect(resultado).toEqual({ reprocesados: 1, cerrados: 1, fallidos: 0 });
    expect(mockCerrarDelivery).toHaveBeenCalledTimes(1);
  });

  it("pasa el deliveryId a getDeliveriesReprocesables cuando se especifica uno", async () => {
    mockGetDeliveriesReprocesables.mockResolvedValue([]);

    await reprocesarDeliveries("delivery-puntual");

    expect(mockGetDeliveriesReprocesables).toHaveBeenCalledWith("delivery-puntual");
  });

  it("sin deliveries reprocesables, devuelve todo en cero", async () => {
    mockGetDeliveriesReprocesables.mockResolvedValue([]);

    const resultado = await reprocesarDeliveries();

    expect(resultado).toEqual({ reprocesados: 0, cerrados: 0, fallidos: 0 });
  });
});
