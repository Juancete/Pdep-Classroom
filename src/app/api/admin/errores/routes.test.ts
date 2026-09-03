import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGuardAdmin = vi.fn();
const mockCount = vi.fn();
const mockAcknowledge = vi.fn();
const mockAcknowledgeAll = vi.fn();
const mockPurge = vi.fn();

vi.mock("@/lib/api-auth", () => ({ guardAdmin: () => mockGuardAdmin() }));
vi.mock("@/infrastructure/repositories", () => ({
  getUnreadErrorLogCount: () => mockCount(),
  acknowledgeErrorLog: (...args: unknown[]) => mockAcknowledge(...args),
  acknowledgeAllErrorLogs: () => mockAcknowledgeAll(),
  purgeAcknowledgedErrorLogs: (...args: unknown[]) => mockPurge(...args),
  ERROR_LOG_RETENTION_DAYS: 90,
}));
vi.mock("@/lib/api-errors", () => ({
  internalErrorSinPersistencia: () => Response.json(
    { error: "Error interno del servidor" },
    { status: 500 }
  ),
}));

import { GET as getCount } from "./count/route";
import { PATCH as acknowledgeOne } from "./[id]/route";
import { POST as acknowledgeAll } from "./acknowledge-all/route";
import { POST as purge } from "./purge/route";

const protectedEndpoints: Array<[string, () => Promise<Response>]> = [
  ["count", () => getCount()],
  ["reconocimiento individual", () => acknowledgeOne(
    new Request("http://test/api/admin/errores/e1", { method: "PATCH" }),
    { params: Promise.resolve({ id: "e1" }) }
  )],
  ["reconocimiento global", () => acknowledgeAll()],
  ["purga", () => purge()],
];

describe("API admin de errores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardAdmin.mockResolvedValue(null);
  });

  it.each(protectedEndpoints)("%s devuelve 401 sin sesión", async (_name, call) => {
    mockGuardAdmin.mockResolvedValue(Response.json({ error: "No autorizado" }, { status: 401 }));
    expect((await call()).status).toBe(401);
    expect(mockCount).not.toHaveBeenCalled();
    expect(mockAcknowledge).not.toHaveBeenCalled();
    expect(mockAcknowledgeAll).not.toHaveBeenCalled();
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it.each(protectedEndpoints)("%s devuelve 403 para alumnos", async (_name, call) => {
    mockGuardAdmin.mockResolvedValue(Response.json({ error: "Acceso prohibido" }, { status: 403 }));
    expect((await call()).status).toBe(403);
    expect(mockCount).not.toHaveBeenCalled();
    expect(mockAcknowledge).not.toHaveBeenCalled();
    expect(mockAcknowledgeAll).not.toHaveBeenCalled();
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it("devuelve el conteo sin cache", async () => {
    mockCount.mockResolvedValue(3);
    const response = await getCount();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ unread: 3 });
  });

  it("reconoce una fila y conserva idempotencia", async () => {
    mockAcknowledge.mockResolvedValueOnce("updated").mockResolvedValueOnce("already-acknowledged");
    const props = { params: Promise.resolve({ id: "e1" }) };
    await expect((await acknowledgeOne(new Request("http://test"), props)).json()).resolves.toEqual({ acknowledged: true });
    await expect((await acknowledgeOne(new Request("http://test"), props)).json()).resolves.toEqual({ acknowledged: false });
  });

  it("devuelve 404 para un id inexistente", async () => {
    mockAcknowledge.mockResolvedValue("not-found");
    const response = await acknowledgeOne(new Request("http://test"), { params: Promise.resolve({ id: "no" }) });
    expect(response.status).toBe(404);
  });

  it("informa cuántas filas reconoció globalmente", async () => {
    mockAcknowledgeAll.mockResolvedValue(7);
    await expect((await acknowledgeAll()).json()).resolves.toEqual({ acknowledged: 7 });
  });

  it("calcula en el servidor el cutoff de 90 días", async () => {
    mockPurge.mockResolvedValue(2);
    const before = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const response = await purge();
    const after = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const cutoff = mockPurge.mock.calls[0]![0] as Date;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after + 1_000);
    await expect(response.json()).resolves.toEqual({ deleted: 2 });
  });

  it("responde 500 sin recursión cuando falla el repositorio", async () => {
    mockCount.mockRejectedValue(new Error("DB caída"));
    expect((await getCount()).status).toBe(500);
  });
});
