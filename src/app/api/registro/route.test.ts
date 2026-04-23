import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockUpsertarAlumnoEnSheets = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockUpsertAlumno = vi.fn();
const mockMarcarRegistroConfirmado = vi.fn();
const mockAgregarMiembroAGrupo = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();

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

vi.mock("@/lib/googleGroups", () => ({
  agregarMiembroAGrupo: (...args: unknown[]) => mockAgregarMiembroAGrupo(...args),
}));

// El handler llama al wrapper `intentarSincronizarGrupos`, que es quien se
// encarga del logging, el flag persistente y el retorno booleano que el
// handler usa para decidir si mete `gruposSync: "error"` en el body.
vi.mock("@/lib/services/intentarSincronizarGrupos", () => ({
  intentarSincronizarGrupos: (...args: unknown[]) =>
    mockIntentarSincronizarGrupos(...args),
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
  githubUsername: "juangarcia", // debe coincidir con el user autenticado del mock
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
    mockMarcarRegistroConfirmado.mockResolvedValue(undefined);
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
    mockIntentarSincronizarGrupos.mockResolvedValue(false);
  });

  it("usa el githubUsername del usuario autenticado cuando coincide con el body", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const [inputPasado] = mockUpsertarAlumnoEnSheets.mock.calls[0];
    expect(inputPasado.githubUsername).toBe("juangarcia");
  });

  it("devuelve 400 con field=githubUsername si el body trae un github distinto al de la sesión", async () => {
    const res = await POST(makeRequest({ ...validBody, githubUsername: "attacker" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.field).toBe("githubUsername");
    expect(json.error).toContain("juangarcia");
    expect(json.error).toContain("attacker");
    expect(mockUpsertAlumno).not.toHaveBeenCalled();
    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
  });

  it("compara githubUsername case-insensitive (no rechaza JuanGarcia vs juangarcia)", async () => {
    const res = await POST(makeRequest({ ...validBody, githubUsername: "JuanGarcia" }));
    expect(res.status).toBe(200);
    const [inputPasado] = mockUpsertAlumno.mock.calls[0];
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

  it("llama a upsertAlumno con comision pero sin registroConfirmadoEn (se marca recién después de Sheets)", async () => {
    const comision = await mockGetComisionActiva();
    await POST(makeRequest(validBody));
    expect(mockUpsertAlumno).toHaveBeenCalledWith(
      expect.objectContaining({
        legajo: "12345",
        githubUsername: "juangarcia",
        email: "juan@gmail.com",
        comision,
      })
    );
    const [dataPasada] = mockUpsertAlumno.mock.calls[0];
    expect(dataPasada.registroConfirmadoEn).toBeUndefined();
  });

  it("marca registroConfirmadoEn después de que Sheets confirmó la escritura", async () => {
    const comision = await mockGetComisionActiva();
    await POST(makeRequest(validBody));
    expect(mockMarcarRegistroConfirmado).toHaveBeenCalledWith("juangarcia", comision);
    const ordenLlamadas = [
      mockUpsertarAlumnoEnSheets.mock.invocationCallOrder[0],
      mockMarcarRegistroConfirmado.mock.invocationCallOrder[0],
    ];
    expect(ordenLlamadas[0]).toBeLessThan(ordenLlamadas[1]);
  });

  it("no marca registroConfirmadoEn si Sheets falla (evita commit parcial)", async () => {
    mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: false, error: "boom" });
    await POST(makeRequest(validBody));
    expect(mockMarcarRegistroConfirmado).not.toHaveBeenCalled();
  });

  it("no toca Sheets si el upsert en DB falla con LegajoConflictError", async () => {
    mockUpsertAlumno.mockRejectedValue(
      new FakeLegajoConflictError("12345", "otro-alumno")
    );
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(400);
    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
  });

  it("devuelve 400 con field=legajo si el upsert en DB detecta que el legajo pertenece a otro github", async () => {
    mockUpsertAlumno.mockRejectedValue(
      new FakeLegajoConflictError("12345", "otro-alumno")
    );
    const res = await POST(makeRequest(validBody));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.field).toBe("legajo");
    expect(json.error).toContain("otro-alumno");
  });

  it("devuelve 400 si la validación de inputs falla sin tocar DB ni Sheets", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "no-es-email" }));
    expect(res.status).toBe(400);
    expect(mockUpsertAlumno).not.toHaveBeenCalled();
    expect(mockUpsertarAlumnoEnSheets).not.toHaveBeenCalled();
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
    // El mensaje del error interno no debe filtrarse al cliente.
    expect(json.error).toBe("Error interno del servidor");
    expect(json.error).not.toContain("boom");
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
      const { logger } = await import("@/lib/logger");
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
      mockAgregarMiembroAGrupo.mockResolvedValue({
        status: "error",
        error: "Sin permisos",
      });
      await POST(makeRequest(validBody));
      const loggedPayload = JSON.stringify(errorSpy.mock.calls);
      // El email completo no debe aparecer, pero sí el dominio y un
      // identificador útil para el admin (githubUsername).
      expect(loggedPayload).not.toContain("juan@gmail.com");
      expect(loggedPayload).toContain("@gmail.com");
      expect(loggedPayload).toContain("juangarcia");
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

  // ── Sincronización de grupos desde planilla ────────────────

  describe("sincronización de grupos desde planilla", () => {
    it("llama a intentarSincronizarGrupos con el github y la comisión activa tras un registro exitoso", async () => {
      const comision = await mockGetComisionActiva();
      await POST(makeRequest(validBody));
      expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith(
        "juangarcia",
        comision
      );
    });

    it("no incluye gruposSync en el body cuando el wrapper devuelve false (ok)", async () => {
      const res = await POST(makeRequest(validBody));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.gruposSync).toBeUndefined();
    });

    it("responde 200 con gruposSync='error' cuando el wrapper devuelve true (falló)", async () => {
      mockIntentarSincronizarGrupos.mockResolvedValue(true);

      const res = await POST(makeRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.gruposSync).toBe("error");
      // El alta no se deshace por un fallo en el hook accesorio
      expect(mockMarcarRegistroConfirmado).toHaveBeenCalledOnce();
    });

    it("no intenta sincronizar si el registro no se confirmó (ej. Sheets falló)", async () => {
      mockUpsertarAlumnoEnSheets.mockResolvedValue({ ok: false, error: "boom" });
      await POST(makeRequest(validBody));
      expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
    });
  });
});
