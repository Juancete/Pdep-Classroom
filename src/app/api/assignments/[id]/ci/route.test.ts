import { describe, it, expect, vi, beforeEach } from "vitest";
import { DOCENTE, ESTUDIANTE } from "@/domain/entities/RolDeUsuario";

const mockGetCurrentUser = vi.fn();
const mockGetEntregasConRepoActivo = vi.fn();
const mockGetEntregaDeUsuario = vi.fn();
const mockSincronizar = vi.fn();
const mockSincronizarParticipacion = vi.fn();
const mockRegistrarErrorOperativo = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getEntregasConRepoActivo: (assignmentId: string) => mockGetEntregasConRepoActivo(assignmentId),
  getEntregaDeUsuario: (assignmentId: string, githubUsername: string) =>
    mockGetEntregaDeUsuario(assignmentId, githubUsername),
}));

vi.mock("@/application/sincronizarCI", () => ({
  sincronizarCIDeEntregas: (entregas: unknown[], opts: unknown) =>
    mockSincronizar(entregas, opts),
}));

vi.mock("@/application/sincronizarParticipacion", () => ({
  sincronizarParticipacionDeEntregas: (entregas: unknown[], opts: unknown) =>
    mockSincronizarParticipacion(entregas, opts),
}));

vi.mock("@/lib/api-errors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-errors")>();
  return {
    ...actual,
    registrarErrorOperativo: (
      route: string,
      error: unknown,
      context?: Record<string, unknown>
    ) => mockRegistrarErrorOperativo(route, error, context),
  };
});

import { POST } from "./route";

function makeRequest(body: unknown = {}): Request {
  return new Request("http://localhost/api/assignments/a1/ci", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/assignments/[id]/ci", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSincronizar.mockResolvedValue({ actualizadas: 1, omitidas: 0, fallidas: [] });
    mockSincronizarParticipacion.mockResolvedValue({ actualizadas: 0, omitidas: 0, fallidas: [] });
  });

  it("devuelve 401 sin sesión", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(401);
    expect(mockSincronizar).not.toHaveBeenCalled();
    expect(mockSincronizarParticipacion).not.toHaveBeenCalled();
  });

  it("un admin sincroniza todas las entregas con repo activo del assignment", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);

    const response = await POST(makeRequest({ forzar: true }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockGetEntregasConRepoActivo).toHaveBeenCalledWith("a1");
    expect(mockGetEntregaDeUsuario).not.toHaveBeenCalled();
    expect(mockSincronizar).toHaveBeenCalledWith(
      [{ id: "e1" }, { id: "e2" }],
      { forzar: true }
    );
    await expect(response.json()).resolves.toEqual({
      actualizadas: 1,
      omitidas: 0,
      fallidas: [],
      participacion: { actualizadas: 0, omitidas: 0, fallidas: [] },
    });
  });

  // Issue #122: la participación se sincroniza con las mismas entregas y el
  // mismo `forzar` que el CI — un admin gasta la misma request en ambas.
  it("un admin sincroniza también la participación, con las mismas entregas y forzar", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    mockSincronizarParticipacion.mockResolvedValue({
      actualizadas: 2,
      omitidas: 0,
      fallidas: [],
    });

    const response = await POST(makeRequest({ forzar: true }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(mockSincronizarParticipacion).toHaveBeenCalledWith(
      [{ id: "e1" }, { id: "e2" }],
      { forzar: true }
    );
    await expect(response.json()).resolves.toEqual({
      actualizadas: 1,
      omitidas: 0,
      fallidas: [],
      participacion: { actualizadas: 2, omitidas: 0, fallidas: [] },
    });
  });

  it("un alumno sólo sincroniza su propia entrega, ignorando cualquier entregaId del body", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "ana", rol: ESTUDIANTE });
    mockGetEntregaDeUsuario.mockResolvedValue({ id: "e-ana" });

    const response = await POST(makeRequest({ entregaId: "otra-entrega" }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockGetEntregaDeUsuario).toHaveBeenCalledWith("a1", "ana");
    expect(mockGetEntregasConRepoActivo).not.toHaveBeenCalled();
    expect(mockSincronizar).toHaveBeenCalledWith([{ id: "e-ana" }], { forzar: undefined });
  });

  // Issue #122: el alumno no ve participación (decisión de alcance) — no
  // tiene sentido gastar su request en `contributors`.
  it("un alumno no sincroniza participación y la respuesta viene en ceros", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "ana", rol: ESTUDIANTE });
    mockGetEntregaDeUsuario.mockResolvedValue({ id: "e-ana" });

    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });

    expect(mockSincronizarParticipacion).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      participacion: { actualizadas: 0, omitidas: 0, fallidas: [] },
    });
  });

  it("un alumno sin entrega sincroniza una lista vacía", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "ana", rol: ESTUDIANTE });
    mockGetEntregaDeUsuario.mockResolvedValue(null);

    await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });

    expect(mockSincronizar).toHaveBeenCalledWith([], { forzar: undefined });
    expect(mockSincronizarParticipacion).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body no matchea el schema", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    const response = await POST(makeRequest({ forzar: "sí" }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(response.status).toBe(400);
    expect(mockSincronizar).not.toHaveBeenCalled();
  });

  it("devuelve 500 para errores inesperados", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockRejectedValue(new Error("DB caída"));
    const response = await POST(makeRequest(), { params: Promise.resolve({ id: "a1" }) });
    expect(response.status).toBe(500);
  });

  it("registra un error operativo cuando el resultado trae fallidas, sin dejar de responder 200", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockResolvedValue([{ id: "e1" }]);
    mockSincronizar.mockResolvedValue({
      actualizadas: 0,
      omitidas: 0,
      fallidas: [
        { repoName: "tp-x", error: "La GitHub App no tiene permisos suficientes (403)" },
      ],
    });

    const response = await POST(makeRequest({ forzar: true }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockRegistrarErrorOperativo).toHaveBeenCalledWith(
      "POST /api/assignments/[id]/ci",
      expect.objectContaining({
        message: "No se pudo actualizar el CI de tp-x: La GitHub App no tiene permisos suficientes (403)",
      }),
      { assignmentId: "a1", fallidas: 1 }
    );
  });

  it("no registra ningún error operativo cuando no hay fallidas", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockResolvedValue([{ id: "e1" }]);
    mockSincronizar.mockResolvedValue({ actualizadas: 1, omitidas: 0, fallidas: [] });

    const response = await POST(makeRequest({ forzar: true }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockRegistrarErrorOperativo).not.toHaveBeenCalled();
  });

  it("registra un error operativo aparte cuando sólo falla la participación, sin dejar de responder 200", async () => {
    mockGetCurrentUser.mockResolvedValue({ githubUsername: "docente1", rol: DOCENTE });
    mockGetEntregasConRepoActivo.mockResolvedValue([{ id: "e1" }]);
    mockSincronizarParticipacion.mockResolvedValue({
      actualizadas: 0,
      omitidas: 0,
      fallidas: [
        { repoName: "tp-x", error: "La GitHub App no tiene permisos suficientes (403)" },
      ],
    });

    const response = await POST(makeRequest({ forzar: true }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(response.status).toBe(200);
    expect(mockRegistrarErrorOperativo).toHaveBeenCalledWith(
      "POST /api/assignments/[id]/ci",
      expect.objectContaining({
        message:
          "No se pudo actualizar la participación de tp-x: La GitHub App no tiene permisos suficientes (403)",
      }),
      { assignmentId: "a1", fallidas: 1, sincronizacion: "participacion" }
    );
  });
});
