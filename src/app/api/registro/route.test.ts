import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireUser = vi.fn();
const mockConfirmarYProcesarAlumno = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/services/alumnoRegistro", () => ({
  confirmarYProcesarAlumno: (...args: unknown[]) =>
    mockConfirmarYProcesarAlumno(...args),
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
      isAdmin: false,
    });
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: true,
      comision: { id: "c1" },
      hooks: { groupSubscription: "added", gruposSync: "ok" },
    });
  });

  it("devuelve 200 con hooks en body cuando todo funciona", async () => {
    const response = await POST(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, groupSubscription: "added" });
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
      hooks: { groupSubscription: "added", gruposSync: "error" },
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

  it("devuelve 500 si algo tira un error inesperado", async () => {
    mockConfirmarYProcesarAlumno.mockRejectedValue(new Error("boom"));
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Error interno del servidor");
    expect(json.error).not.toContain("boom");
  });

  describe("suscripción al Google Group", () => {
    it("devuelve groupSubscription:'added'", async () => {
      const response = await POST(makeRequest(validBody));
      const json = await response.json();
      expect(json.groupSubscription).toBe("added");
    });

    it("devuelve groupSubscription:'already_member'", async () => {
      mockConfirmarYProcesarAlumno.mockResolvedValue({
        ok: true,
        comision: { id: "c1" },
        hooks: { groupSubscription: "already_member" },
      });
      const response = await POST(makeRequest(validBody));
      const json = await response.json();
      expect(json.groupSubscription).toBe("already_member");
    });

    it("devuelve groupSubscription:'error' sin romper el registro", async () => {
      mockConfirmarYProcesarAlumno.mockResolvedValue({
        ok: true,
        comision: { id: "c1" },
        hooks: { groupSubscription: "error" },
      });
      const response = await POST(makeRequest(validBody));
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.groupSubscription).toBe("error");
    });

    it("no llama al servicio si la validación github↔sesión falla antes", async () => {
      await POST(makeRequest({ ...validBody, githubUsername: "attacker" }));
      expect(mockConfirmarYProcesarAlumno).not.toHaveBeenCalled();
    });
  });
});
