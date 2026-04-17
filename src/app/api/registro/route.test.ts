import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockUpsertarAlumnoEnSheets = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockUpsertAlumno = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/sheets", () => ({
  upsertarAlumnoEnSheets: (...args: unknown[]) => mockUpsertarAlumnoEnSheets(...args),
}));

vi.mock("@/lib/repositories", () => ({
  getComisionActiva: () => mockGetComisionActiva(),
  upsertAlumno: (data: unknown) => mockUpsertAlumno(data),
}));

import { POST } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/registro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  legajo: "12345",
  apellido: "García",
  nombre: "Juan",
  email: "juan@gmail.com",
  githubUsername: "attacker", // se ignora — se reemplaza por el del user autenticado
};

// ── Tests ────────────────────────────────────────────────────

describe("POST /api/registro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      githubUsername: "juangarcia",
      name: "Juan",
      image: "",
      isAdmin: false,
    });
    mockGetComisionActiva.mockResolvedValue({
      id: "c1",
      spreadsheetId: "sheet-xyz",
      columnConfig: { sheetName: "Alumnos", headerRows: 1, legajo: 0, apellido: 1, nombre: 2, githubUsername: 3, email: 4 },
    });
    mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: true });
    mockUpsertAlumno.mockResolvedValue(undefined);
  });

  it("fuerza el githubUsername del usuario autenticado (ignora el del body)", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const [inputPasado] = mockUpsertarAlumnoEnSheets.mock.calls[0];
    expect(inputPasado.githubUsername).toBe("juangarcia");
  });

  it("llama a upsertarAlumnoEnSheets con el spreadsheetId y columnConfig de la comisión activa", async () => {
    const comision = await mockGetComisionActiva();
    await POST(makeRequest(validBody));
    expect(mockUpsertarAlumnoEnSheets).toHaveBeenCalledWith(
      expect.any(Object),
      "sheet-xyz",
      comision.columnConfig
    );
  });

  it("llama a upsertAlumno con comision y registroConfirmadoEn = comisión activa", async () => {
    const comision = await mockGetComisionActiva();
    await POST(makeRequest(validBody));
    expect(mockUpsertAlumno).toHaveBeenCalledWith(
      expect.objectContaining({
        legajo: "12345",
        githubUsername: "juangarcia",
        email: "juan@gmail.com",
        comision,
        registroConfirmadoEn: comision,
      })
    );
  });

  it("no llama a upsertAlumno si la escritura en Sheets falla", async () => {
    mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: false, error: "Legajo duplicado" });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Legajo duplicado");
    expect(mockUpsertAlumno).not.toHaveBeenCalled();
  });

  it("devuelve 409 sin tocar Sheets ni DB si no hay comisión activa", async () => {
    mockGetComisionActiva.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
    expect(mockUpsertAlumno).not.toHaveBeenCalled();
  });

  it("devuelve 500 si algo tira un error inesperado", async () => {
    mockUpsertarAlumnoEnSheets.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("boom");
  });
});
