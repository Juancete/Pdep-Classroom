import { describe, it, expect, vi, beforeEach } from "vitest";
import { ESTUDIANTE } from "@/domain/entities";
import { PermisosNoVerificablesError } from "@/infrastructure/auth/PermisosNoVerificablesError";
import { PlanillaNoDisponibleError } from "@/infrastructure/PlanillaNoDisponibleError";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockConfirmarYProcesarAlumno = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/application/alumnoRegistro", () => ({
  confirmarYProcesarAlumno: (...args: unknown[]) =>
    mockConfirmarYProcesarAlumno(...args),
}));

// Para las aserciones sobre `internalServerError`/`respuestaDeErrorDeDominio`
// (contexto que se loguea/persiste), mismo patrón que
// `src/lib/internal-server-error.test.ts`: `after` sólo captura la tarea, y
// se mockean el logger y el import perezoso de ErrorLogRepository.
const mockAfter = vi.fn();
const mockRegistrarErrorInesperado = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (task: () => unknown) => mockAfter(task) };
});
vi.mock("@/infrastructure/repositories/ErrorLogRepository", () => ({
  registrarErrorInesperado: (...args: unknown[]) => mockRegistrarErrorInesperado(...args),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: (...args: unknown[]) => mockLoggerError(...args) },
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
  githubUsername: "juangarcia",
};

// ── Tests ────────────────────────────────────────────────────

describe("POST /api/registro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({
      githubUsername: "juangarcia",
      name: "Juan",
      image: "",
      rol: ESTUDIANTE,
    });
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: true,
      comision: { id: "c1" },
      hooks: { canalesConError: [], gruposSync: "ok" },
    });
  });

  it("devuelve 200 con hooks en body cuando todo funciona", async () => {
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, canalesConError: [] });
  });

  it("no incluye gruposSync en el body cuando el hook no falla", async () => {
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(json.gruposSync).toBeUndefined();
  });

  it("incluye gruposSync:'error' cuando el hook de sync falla", async () => {
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: true,
      comision: { id: "c1" },
      hooks: { canalesConError: [], gruposSync: "error" },
    });
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.gruposSync).toBe("error");
  });

  it("pasa el email del body como email en el contexto al servicio", async () => {
    await POST(makeRequest(validBody));
    const [inputPasado] = mockConfirmarYProcesarAlumno.mock.calls[0];
    expect(inputPasado.email).toBe("juan@gmail.com");
  });

  it("usa el githubUsername del usuario autenticado cuando coincide con el body", async () => {
    await POST(makeRequest(validBody));
    const [inputPasado] = mockConfirmarYProcesarAlumno.mock.calls[0];
    expect(inputPasado.githubUsername).toBe("juangarcia");
  });

  it("devuelve 400 con field=githubUsername si el body trae un github distinto al de la sesión", async () => {
    const response = await POST(makeRequest({ ...validBody, githubUsername: "attacker" }));
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.field).toBe("githubUsername");
    expect(json.error).toContain("juangarcia");
    expect(json.error).toContain("attacker");
    expect(mockConfirmarYProcesarAlumno).not.toHaveBeenCalled();
  });

  it("compara githubUsername case-insensitive (no rechaza JuanGarcia vs juangarcia)", async () => {
    const response = await POST(makeRequest({ ...validBody, githubUsername: "JuanGarcia" }));
    expect(response.status).toBe(200);
  });

  it("devuelve 400 con el error del servicio cuando ok:false", async () => {
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: false,
      status: 400,
      error: "El email es inválido",
    });
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toBe("El email es inválido");
    expect(json.field).toBeUndefined();
  });

  it("devuelve 400 con field cuando el servicio devuelve field", async () => {
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: false,
      status: 400,
      error: "El legajo ya está registrado con otro usuario",
      field: "legajo",
    });
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.field).toBe("legajo");
  });

  it("devuelve 409 cuando el servicio devuelve status 409", async () => {
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: false,
      status: 409,
      error: "No hay comisión activa",
    });
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(409);
  });

  it("devuelve 400 si el body no es un objeto", async () => {
    const response = await POST(
      new Request("http://localhost/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("cadena"),
      })
    );
    expect(response.status).toBe(400);
    expect(mockConfirmarYProcesarAlumno).not.toHaveBeenCalled();
  });

  it("devuelve 500 si algo tira un error inesperado, y registra con el contexto de la sesión y el body", async () => {
    mockConfirmarYProcesarAlumno.mockRejectedValue(new Error("boom"));
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Error interno del servidor");
    expect(json.error).not.toContain("boom");

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        githubUsername: "juangarcia",
        legajo: validBody.legajo,
        route: "POST /api/registro",
      }),
      "handler error"
    );
    await mockAfter.mock.calls[0]![0]();
    expect(mockRegistrarErrorInesperado).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/registro",
        context: expect.objectContaining({
          githubUsername: "juangarcia",
          legajo: validBody.legajo,
        }),
      })
    );
  });

  it("devuelve 503 controlado (sin filtrar el detalle del SDK) y registra con contexto cuando Sheets no está disponible", async () => {
    const errorDePlanilla = new PlanillaNoDisponibleError(
      new Error("The caller does not have permission")
    );
    mockConfirmarYProcesarAlumno.mockRejectedValue(errorDePlanilla);

    const response = await POST(makeRequest(validBody));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe(
      "Tus datos quedaron guardados, pero no pudimos actualizar la planilla de la cátedra. Reintentá en unos minutos y, si persiste, avisale a un docente."
    );
    expect(json.error).not.toContain("The caller does not have permission");

    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        githubUsername: "juangarcia",
        legajo: validBody.legajo,
        route: "POST /api/registro",
      }),
      "handler error"
    );
    await mockAfter.mock.calls[0]![0]();
    expect(mockRegistrarErrorInesperado).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "POST /api/registro",
        context: expect.objectContaining({
          githubUsername: "juangarcia",
          legajo: validBody.legajo,
        }),
      })
    );
  });

  it("devuelve 503 controlado (no un 500 inesperado) cuando no se pudieron verificar los permisos", async () => {
    mockRequireUser.mockRejectedValue(
      new PermisosNoVerificablesError(new Error("DB caída"))
    );
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.error).toBe(
      "No se pudieron verificar tus permisos. Reintentá en unos segundos."
    );
    expect(mockConfirmarYProcesarAlumno).not.toHaveBeenCalled();
  });

  describe("suscripción a canales de comunicación", () => {
    it("devuelve canalesConError vacío cuando todos sincronizaron", async () => {
      const response = await POST(makeRequest(validBody));
      const json = await response.json();
      expect(json.canalesConError).toEqual([]);
    });

    it("devuelve el asunto del canal que falló sin romper el registro", async () => {
      mockConfirmarYProcesarAlumno.mockResolvedValue({
        ok: true,
        comision: { id: "c1" },
        hooks: { canalesConError: ["suscribirte al grupo de Google del curso"] },
      });
      const response = await POST(makeRequest(validBody));
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.canalesConError).toEqual(["suscribirte al grupo de Google del curso"]);
    });

    it("devuelve canalesConError vacío cuando el hook no lo trae", async () => {
      mockConfirmarYProcesarAlumno.mockResolvedValue({
        ok: true,
        comision: { id: "c1" },
        hooks: {},
      });
      const response = await POST(makeRequest(validBody));
      const json = await response.json();
      expect(json.canalesConError).toEqual([]);
    });

    it("no llama al servicio si la validación github↔sesión falla antes", async () => {
      await POST(makeRequest({ ...validBody, githubUsername: "attacker" }));
      expect(mockConfirmarYProcesarAlumno).not.toHaveBeenCalled();
    });
  });
});
