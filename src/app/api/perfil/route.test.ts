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

const { FakeLegajoConflictError } = vi.hoisted(() => {
  class FakeLegajoConflictError extends Error {
    constructor(
      public readonly legajo: string,
      public readonly otroGithubUsername: string
    ) {
      super(
        `El legajo ${legajo} ya está registrado con el usuario @${otroGithubUsername}. Verificá que sea el tuyo.`
      );
      this.name = "LegajoConflictError";
    }
  }
  return { FakeLegajoConflictError };
});

vi.mock("@/lib/repositories", () => ({
  getComisionActiva: () => mockGetComisionActiva(),
  upsertAlumno: (data: unknown) => mockUpsertAlumno(data),
  LegajoConflictError: FakeLegajoConflictError,
}));

import { PATCH } from "./route";

// ── Helpers ──────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/perfil", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  legajo: "12345",
  apellido: "García",
  nombre: "Juan",
  email: "juan@gmail.com",
};

// ── Tests ────────────────────────────────────────────────────

describe("PATCH /api/perfil", () => {
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

  it("actualiza Sheets y DB en un mismo request", async () => {
    const res = await PATCH(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(mockUpsertarAlumnoEnSheets).toHaveBeenCalledTimes(1);
    expect(mockUpsertAlumno).toHaveBeenCalledTimes(1);
  });

  it("usa el githubUsername del usuario autenticado (no del body)", async () => {
    await PATCH(makeRequest({ ...validBody, githubUsername: "attacker" }));
    const [inputPasado] = mockUpsertarAlumnoEnSheets.mock.calls[0];
    expect(inputPasado.githubUsername).toBe("juangarcia");
  });

  it("vuelve a setear registroConfirmadoEn a la comisión activa (mantiene consistencia)", async () => {
    const comision = await mockGetComisionActiva();
    await PATCH(makeRequest(validBody));
    expect(mockUpsertAlumno).toHaveBeenCalledWith(
      expect.objectContaining({ registroConfirmadoEn: comision })
    );
  });

  it("no llama a upsertAlumno si la escritura en Sheets falla", async () => {
    mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: false, error: "email inválido" });
    const res = await PATCH(makeRequest(validBody));
    expect(res.status).toBe(400);
    expect(mockUpsertAlumno).not.toHaveBeenCalled();
  });

  it("propaga el field de Sheets en la respuesta (ej: legajo ya pertenece a otro github)", async () => {
    mockUpsertarAlumnoEnSheets.mockResolvedValue({
      ok: false,
      error: "El legajo 12345 ya está registrado con el usuario @otro. Verificá que sea el tuyo.",
      field: "legajo",
    });
    const res = await PATCH(makeRequest(validBody));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.field).toBe("legajo");
  });

  it("devuelve 400 con field=legajo si el upsert en DB detecta conflicto de legajo", async () => {
    mockUpsertAlumno.mockRejectedValue(
      new FakeLegajoConflictError("12345", "otro-alumno")
    );
    const res = await PATCH(makeRequest(validBody));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.field).toBe("legajo");
    expect(json.error).toContain("otro-alumno");
  });

  it("devuelve 409 sin tocar Sheets ni DB si no hay comisión activa", async () => {
    mockGetComisionActiva.mockResolvedValue(null);
    const res = await PATCH(makeRequest(validBody));
    expect(res.status).toBe(409);
    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
    expect(mockUpsertAlumno).not.toHaveBeenCalled();
  });

  it("devuelve 500 si algo tira un error inesperado", async () => {
    mockUpsertarAlumnoEnSheets.mockRejectedValue(new Error("boom"));
    const res = await PATCH(makeRequest(validBody));
    expect(res.status).toBe(500);
  });
});
