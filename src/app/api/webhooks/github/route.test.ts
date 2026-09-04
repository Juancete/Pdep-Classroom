import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReclamar = vi.fn();
const mockProcesarDeliveryReclamado = vi.fn();
const mockAfter = vi.fn();

vi.mock("@/application/recibirWebhookGithub", () => ({
  reclamarDeliveryEntrante: (...args: unknown[]) => mockReclamar(...args),
  procesarDeliveryReclamado: (...args: unknown[]) => mockProcesarDeliveryReclamado(...args),
  MAX_WEBHOOK_BODY_BYTES: 1_048_576,
}));

// `after()` es lo que permite responder rápido (issue #60, hallazgo de
// timeout de 10s de GitHub) y diferir el procesamiento real — se mockea
// para capturar el callback en vez de ejecutarlo de verdad, y `NextResponse`
// se deja intacto vía `importOriginal`.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => mockAfter(task),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST } from "./route";

function firmar(raw: string, secreto: string): string {
  return "sha256=" + createHmac("sha256", secreto).update(raw, "utf8").digest("hex");
}

function buildRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/webhooks/github", {
    method: "POST",
    headers,
    body,
  });
}

const REPO_PAYLOAD = JSON.stringify({ repository: { name: "kata-juan" } });

describe("POST /api/webhooks/github", () => {
  const envOriginal = process.env.GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (envOriginal === undefined) {
      delete process.env.GITHUB_WEBHOOK_SECRET;
    } else {
      process.env.GITHUB_WEBHOOK_SECRET = envOriginal;
    }
  });

  it("devuelve 503 si GITHUB_WEBHOOK_SECRET no está configurada", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "cualquiera"),
        "x-github-delivery": "d1",
        "x-github-event": "push",
      })
    );
    expect(response.status).toBe(503);
    expect(mockReclamar).not.toHaveBeenCalled();
  });

  it("devuelve 413 si el content-length declarado excede el límite", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "content-length": String(2_000_000),
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "secreto"),
      })
    );
    expect(response.status).toBe(413);
    expect(mockReclamar).not.toHaveBeenCalled();
  });

  it("devuelve 413 si el body real excede el límite aunque no haya content-length", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    const bodyEnorme = JSON.stringify({
      repository: { name: "kata-juan" },
      relleno: "x".repeat(1_100_000),
    });
    const response = await POST(
      buildRequest(bodyEnorme, { "x-hub-signature-256": firmar(bodyEnorme, "secreto") })
    );
    expect(response.status).toBe(413);
    expect(mockReclamar).not.toHaveBeenCalled();
  });

  it("devuelve 401 con firma inválida", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "otro-secreto"),
        "x-github-delivery": "d1",
        "x-github-event": "push",
      })
    );
    expect(response.status).toBe(401);
    expect(mockReclamar).not.toHaveBeenCalled();
  });

  it("devuelve 401 sin header de firma", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    const response = await POST(
      buildRequest(REPO_PAYLOAD, { "x-github-delivery": "d1", "x-github-event": "push" })
    );
    expect(response.status).toBe(401);
    expect(mockReclamar).not.toHaveBeenCalled();
  });

  it("devuelve 400 sin el header x-github-delivery", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "secreto"),
        "x-github-event": "push",
      })
    );
    expect(response.status).toBe(400);
    expect(mockReclamar).not.toHaveBeenCalled();
  });

  it("devuelve 400 con JSON inválido", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    const bodyRoto = "{ esto no es json";
    const response = await POST(
      buildRequest(bodyRoto, {
        "x-hub-signature-256": firmar(bodyRoto, "secreto"),
        "x-github-delivery": "d1",
        "x-github-event": "push",
      })
    );
    expect(response.status).toBe(400);
    expect(mockReclamar).not.toHaveBeenCalled();
  });

  it("devuelve 202 y difiere el procesamiento con after() sin bloquear la respuesta", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    const delivery = { id: "row-1", evento: "push", payload: { repository: { name: "kata-juan" } } };
    mockReclamar.mockResolvedValue({ tipo: "aceptado", delivery });

    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "secreto"),
        "x-github-delivery": "d1",
        "x-github-event": "push",
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ aceptado: true });
    expect(mockReclamar).toHaveBeenCalledWith({
      deliveryId: "d1",
      evento: "push",
      payload: { repository: { name: "kata-juan" } },
    });
    expect(mockAfter).toHaveBeenCalledWith(expect.any(Function));
    // El procesamiento real no corrió todavía en el ciclo de request/response.
    expect(mockProcesarDeliveryReclamado).not.toHaveBeenCalled();

    // Invocar el callback diferido es justamente lo que Next ejecuta
    // después de responder — confirma que apunta al delivery reclamado.
    await mockAfter.mock.calls[0]![0]();
    expect(mockProcesarDeliveryReclamado).toHaveBeenCalledWith(delivery);
  });

  it("devuelve 200 duplicado sin reclamar nada para procesar", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    mockReclamar.mockResolvedValue({ tipo: "duplicado" });

    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "secreto"),
        "x-github-delivery": "d1",
        "x-github-event": "push",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ duplicado: true });
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("devuelve 500 para un error inesperado al reclamar", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secreto";
    mockReclamar.mockRejectedValue(new Error("DB caída"));

    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "secreto"),
        "x-github-delivery": "d1",
        "x-github-event": "push",
      })
    );

    expect(response.status).toBe(500);
    // `internalServerError` difiere ahora la persistencia del error de observabilidad.
    expect(mockAfter).toHaveBeenCalledOnce();
  });

  it("acepta una firma hecha con el segundo secreto de una lista rotada", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "viejo,nuevo";
    mockReclamar.mockResolvedValue({
      tipo: "aceptado",
      delivery: { id: "row-1", evento: "push", payload: {} },
    });

    const response = await POST(
      buildRequest(REPO_PAYLOAD, {
        "x-hub-signature-256": firmar(REPO_PAYLOAD, "nuevo"),
        "x-github-delivery": "d1",
        "x-github-event": "push",
      })
    );

    expect(response.status).toBe(202);
    expect(mockReclamar).toHaveBeenCalled();
  });
});
