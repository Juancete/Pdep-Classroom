import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/infrastructure/db", () => ({
  getEM: vi.fn(async () => ({
    getConnection: () => ({ execute }),
  })),
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue([{ "?column?": 1 }]);
  });

  it("responde 200 cuando la base está disponible", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, database: "ok" });
    expect(execute).toHaveBeenCalledWith("select 1");
  });

  it("responde 503 sin filtrar el error de conexión", async () => {
    execute.mockRejectedValueOnce(new Error("password secreto en el error"));

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, database: "error" });
    expect(JSON.stringify(body)).not.toContain("secreto");
  });
});
