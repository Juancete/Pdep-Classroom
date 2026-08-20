import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGuardAdmin = vi.fn();
const mockReprocesar = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  guardAdmin: () => mockGuardAdmin(),
}));

vi.mock("@/lib/services/recibirWebhookGithub", () => ({
  reprocesarDeliveries: (deliveryId?: string) => mockReprocesar(deliveryId),
}));

import { POST } from "./route";

function makeRequest(body: unknown = {}): Request {
  return new Request("http://localhost/api/webhooks/github/reprocesar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody?: string): Request {
  return new Request("http://localhost/api/webhooks/github/reprocesar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(rawBody !== undefined ? { body: rawBody } : {}),
  });
}

describe("POST /api/webhooks/github/reprocesar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 401 sin admin", async () => {
    mockGuardAdmin.mockResolvedValue(
      new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 })
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockReprocesar).not.toHaveBeenCalled();
  });

  it("con admin, reprocesa todos los deliveries pendientes sin deliveryId", async () => {
    mockGuardAdmin.mockResolvedValue(null);
    mockReprocesar.mockResolvedValue({ reprocesados: 2, cerrados: 1, fallidos: 1 });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockReprocesar).toHaveBeenCalledWith(undefined);
    await expect(response.json()).resolves.toEqual({
      reprocesados: 2,
      cerrados: 1,
      fallidos: 1,
    });
  });

  it("con admin y deliveryId, reprocesa sólo ese delivery", async () => {
    mockGuardAdmin.mockResolvedValue(null);
    mockReprocesar.mockResolvedValue({ reprocesados: 1, cerrados: 1, fallidos: 0 });

    const response = await POST(makeRequest({ deliveryId: "delivery-puntual" }));

    expect(response.status).toBe(200);
    expect(mockReprocesar).toHaveBeenCalledWith("delivery-puntual");
  });

  it("devuelve 400 si el body no matchea el schema", async () => {
    mockGuardAdmin.mockResolvedValue(null);

    const response = await POST(makeRequest({ deliveryId: 123 }));

    expect(response.status).toBe(400);
    expect(mockReprocesar).not.toHaveBeenCalled();
  });

  it("devuelve 400 si deliveryId es un string vacío (evita disparar el lote completo por error)", async () => {
    mockGuardAdmin.mockResolvedValue(null);

    const response = await POST(makeRequest({ deliveryId: "" }));

    expect(response.status).toBe(400);
    expect(mockReprocesar).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body trae una clave desconocida por typo, en vez de tratarla como 'sin filtro'", async () => {
    mockGuardAdmin.mockResolvedValue(null);

    // Sin `.strict()`, zod ignora "deliverId" (falta la "y") y lo
    // interpreta como `{}` → dispararía el lote completo de 50 por error.
    const response = await POST(makeRequest({ deliverId: "delivery-puntual" }));

    expect(response.status).toBe(400);
    expect(mockReprocesar).not.toHaveBeenCalled();
  });

  it("sin ningún body enviado, reprocesa el lote completo (comportamiento válido a propósito)", async () => {
    mockGuardAdmin.mockResolvedValue(null);
    mockReprocesar.mockResolvedValue({ reprocesados: 0, cerrados: 0, fallidos: 0 });

    const response = await POST(makeRawRequest());

    expect(response.status).toBe(200);
    expect(mockReprocesar).toHaveBeenCalledWith(undefined);
  });

  it("devuelve 400 con JSON inválido en vez de tratarlo silenciosamente como 'sin filtro'", async () => {
    mockGuardAdmin.mockResolvedValue(null);

    const response = await POST(makeRawRequest("{ esto no es json"));

    expect(response.status).toBe(400);
    expect(mockReprocesar).not.toHaveBeenCalled();
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockGuardAdmin.mockResolvedValue(null);
    mockReprocesar.mockRejectedValue(new Error("DB caída"));

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
  });
});
