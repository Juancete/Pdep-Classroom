import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockUpsertarAlumnoEnSheets = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockUpsertAlumno = vi.fn();
const mockAgregarMiembroAGrupo = vi.fn();

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

vi.mock("@/lib/googleGroups", () => ({
  agregarMiembroAGrupo: (...args: unknown[]) => mockAgregarMiembroAGrupo(...args),
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
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
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

  // ── Suscripción al Google Group ────────────────────────────

  describe("suscripción al Google Group", () => {
    it("llama a agregarMiembroAGrupo con el email del alumno tras un registro exitoso", async () => {
      await POST(makeRequest(validBody));
      expect(mockAgregarMiembroAGrupo).toHaveBeenCalledWith("juan@gmail.com");
    });

    it("devuelve groupSubscription: 'added' en el body cuando la suscripción funciona", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
      const res = await POST(makeRequest(validBody));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json).toEqual({ ok: true, groupSubscription: "added" });
    });

    it("devuelve groupSubscription: 'already_member' cuando el alumno ya estaba en el grupo", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({ status: "already_member" });
      const res = await POST(makeRequest(validBody));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.groupSubscription).toBe("already_member");
    });

    it("devuelve groupSubscription: 'skipped' cuando la feature está desactivada", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({ status: "skipped" });
      const res = await POST(makeRequest(validBody));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.groupSubscription).toBe("skipped");
    });

    it("no rompe el registro si la suscripción falla (responde 200 con status 'error')", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({
        status: "error",
        error: "Sin permisos",
      });
      const res = await POST(makeRequest(validBody));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.groupSubscription).toBe("error");
      // El alta en DB ya ocurrió antes de intentar la suscripción
      expect(mockUpsertAlumno).toHaveBeenCalledOnce();
    });

    it("enmascara el email en el log de error para no exponer PII", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockAgregarMiembroAGrupo.mockResolvedValue({
        status: "error",
        error: "Sin permisos",
      });
      await POST(makeRequest(validBody));
      const loggedLines = errorSpy.mock.calls.flat().join(" ");
      // El email completo no debe aparecer, pero sí el dominio y un
      // identificador útil para el admin (githubUsername).
      expect(loggedLines).not.toContain("juan@gmail.com");
      expect(loggedLines).toContain("@gmail.com");
      expect(loggedLines).toContain("juangarcia");
      errorSpy.mockRestore();
    });

    it("no intenta suscribir si la escritura en Sheets falla", async () => {
      mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: false, error: "Legajo duplicado" });
      await POST(makeRequest(validBody));
      expect(mockAgregarMiembroAGrupo).not.toHaveBeenCalled();
    });

    it("no intenta suscribir si no hay comisión activa", async () => {
      mockGetComisionActiva.mockResolvedValue(null);
      await POST(makeRequest(validBody));
      expect(mockAgregarMiembroAGrupo).not.toHaveBeenCalled();
    });
  });
});
