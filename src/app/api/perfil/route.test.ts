import { describe, it, expect, vi, beforeEach } from "vitest";
import { ESTUDIANTE } from "@/domain/entities";

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
      rol: ESTUDIANTE,
    });
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: true,
      comision: { id: "c1" },
      hooks: { groupSubscription: "already_member", gruposSync: "ok" },
    });
  });

  it("devuelve 200 con hooks en body cuando todo funciona", async () => {
    const response = await PATCH(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, groupSubscription: "already_member" });
  });

  it("no incluye gruposSync en el body cuando el hook no falla", async () => {
    const response = await PATCH(makeRequest(validBody));
    const json = await response.json();
    expect(json.gruposSync).toBeUndefined();
  });

  it("incluye gruposSync:'error' cuando el hook de sync falla", async () => {
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: true,
      comision: { id: "c1" },
      hooks: { groupSubscription: "already_member", gruposSync: "error" },
    });
    const response = await PATCH(makeRequest(validBody));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.gruposSync).toBe("error");
  });

  it("usa el githubUsername del usuario autenticado (no del body)", async () => {
    await PATCH(makeRequest({ ...validBody, githubUsername: "attacker" }));
    const [inputPasado] = mockConfirmarYProcesarAlumno.mock.calls[0];
    expect(inputPasado.githubUsername).toBe("juangarcia");
  });

  it("la respuesta incluye groupSubscription (perfil también suscribe al grupo)", async () => {
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: true,
      comision: { id: "c1" },
      hooks: { groupSubscription: "added" },
    });
    const response = await PATCH(makeRequest(validBody));
    const json = await response.json();
    expect(json.groupSubscription).toBe("added");
  });

  it("devuelve 400 con el error del servicio cuando ok:false", async () => {
    mockConfirmarYProcesarAlumno.mockResolvedValue({
      ok: false,
      status: 400,
      error: "El email es inválido",
    });
    const response = await PATCH(makeRequest(validBody));
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
    const response = await PATCH(makeRequest(validBody));
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
    const response = await PATCH(makeRequest(validBody));
    expect(response.status).toBe(409);
  });

  it("devuelve 500 si algo tira un error inesperado", async () => {
    mockConfirmarYProcesarAlumno.mockRejectedValue(new Error("boom"));
    const response = await PATCH(makeRequest(validBody));
    expect(response.status).toBe(500);
  });

  it("devuelve 400 si el body no es un objeto", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("cadena"),
      })
    );
    expect(response.status).toBe(400);
    expect(mockConfirmarYProcesarAlumno).not.toHaveBeenCalled();
  });
});
