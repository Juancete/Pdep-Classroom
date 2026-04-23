import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockUpsertarAlumnoEnSheets = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockUpsertAlumno = vi.fn();
const mockMarcarRegistroConfirmado = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/sheets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sheets")>("@/lib/sheets");
  return {
    upsertarAlumnoEnSheets: (...args: unknown[]) => mockUpsertarAlumnoEnSheets(...args),
    validateRegistro: actual.validateRegistro,
  };
});

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
  marcarRegistroConfirmado: (...args: unknown[]) =>
    mockMarcarRegistroConfirmado(...args),
  LegajoConflictError: FakeLegajoConflictError,
}));

// El hook de sync de grupos arrastra `@/lib/db` (reflect-metadata) si no se
// mockea acá. Como el route test no verifica el comportamiento del hook (lo
// hace `alumnoRegistro.test.ts`), basta con un stub no-op.
vi.mock("@/lib/services/grupoSync", () => ({
  sincronizarGruposDelAlumno: vi.fn().mockResolvedValue(undefined),
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
    mockMarcarRegistroConfirmado.mockResolvedValue(undefined);
  });

  it("actualiza Sheets y DB en un mismo request", async () => {
    const res = await PATCH(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(mockUpsertarAlumnoEnSheets).toHaveBeenCalledTimes(1);
    expect(mockUpsertAlumno).toHaveBeenCalledTimes(1);
  });

  it("usa el githubUsername del usuario autenticado (no del body)", async () => {
    await PATCH(makeRequest({ ...validBody, githubUsername: "attacker" }));
    const [inputPasado] = mockUpsertAlumno.mock.calls[0];
    expect(inputPasado.githubUsername).toBe("juangarcia");
  });

  it("marca registroConfirmadoEn recién después de que Sheets confirmó", async () => {
    const comision = await mockGetComisionActiva();
    await PATCH(makeRequest(validBody));
    expect(mockMarcarRegistroConfirmado).toHaveBeenCalledWith("juangarcia", comision);
    const [dataPasada] = mockUpsertAlumno.mock.calls[0];
    expect(dataPasada.registroConfirmadoEn).toBeUndefined();
  });

  it("no marca registroConfirmadoEn si Sheets falla", async () => {
    mockUpsertarAlumnoEnSheets.mockResolvedValue({
      ok: false,
      error: "sheets error",
    });
    await PATCH(makeRequest(validBody));
    expect(mockMarcarRegistroConfirmado).not.toHaveBeenCalled();
  });

  it("no toca Sheets si el upsert en DB falla con LegajoConflictError", async () => {
    mockUpsertAlumno.mockRejectedValue(
      new FakeLegajoConflictError("12345", "otro-alumno")
    );
    const res = await PATCH(makeRequest(validBody));
    expect(res.status).toBe(400);
    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
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

  it("devuelve 400 si la validación de inputs falla sin tocar DB ni Sheets", async () => {
    const res = await PATCH(makeRequest({ ...validBody, email: "no-es-email" }));
    expect(res.status).toBe(400);
    expect(mockUpsertAlumno).not.toHaveBeenCalled();
    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
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
