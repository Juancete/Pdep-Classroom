import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Mocks para la persistencia diferida de errores registrados ──────────
// Mismo patrón que `src/lib/internal-server-error.test.ts`: `after` sólo
// captura la tarea (se ejecuta manualmente en el test), y se mockean el
// logger y el import perezoso de ErrorLogRepository para no tocar Pino ni
// MikroORM en estos tests.

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
vi.mock("./logger", () => ({
  logger: { error: (...args: unknown[]) => mockLoggerError(...args) },
}));

import { parseJsonObjectBody, respuestaDeErrorDeDominio } from "./api-errors";
import {
  AssignmentNoEncontradoError,
  GrupoNoEncontradoError,
  InscripcionesCerradasError,
  AssignmentNoGrupalError,
  NombreGrupoInvalidoError,
  ColaboradorNoInvitableError,
} from "@/domain/entities";
import { PermisosNoVerificablesError } from "@/infrastructure/auth/PermisosNoVerificablesError";
import { PlanillaNoDisponibleError } from "@/infrastructure/PlanillaNoDisponibleError";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown, contentType = "application/json"): Request {
  return new Request("http://test.local/api/test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("parseJsonObjectBody", () => {
  it("devuelve el objeto cuando el body es un objeto plano válido", async () => {
    const request = makeRequest({ legajo: "12345", nombre: "Juan" });
    const result = await parseJsonObjectBody(request);
    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result).toEqual({ legajo: "12345", nombre: "Juan" });
  });

  it("devuelve NextResponse 400 cuando el body es null JSON", async () => {
    const request = makeRequest(null);
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("No pudimos leer los datos enviados");
  });

  it("devuelve NextResponse 400 cuando el body es un array JSON", async () => {
    const request = makeRequest([1, 2, 3]);
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
  });

  it("devuelve NextResponse 400 cuando el body no es JSON válido", async () => {
    const request = new Request("http://test.local/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "esto-no-es-json",
    });
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    // El bug original devolvía 500 porque req.json() tiraba excepción sin .catch().
    // Con el helper, un body mal formado devuelve 400.
    expect(response.status).toBe(400);
  });

  it("devuelve NextResponse 400 cuando el body es un string JSON", async () => {
    const request = new Request("http://test.local/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("un string"),
    });
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
  });

  it("devuelve NextResponse 400 cuando el body es un número JSON", async () => {
    const request = new Request("http://test.local/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(42),
    });
    const result = await parseJsonObjectBody(request);
    expect(result).toBeInstanceOf(NextResponse);
    const response = result as NextResponse;
    expect(response.status).toBe(400);
  });
});

describe("respuestaDeErrorDeDominio", () => {
  it("devuelve null para un Error genérico (no está en la tabla)", () => {
    expect(respuestaDeErrorDeDominio(new Error("cualquier cosa"))).toBeNull();
  });

  it("devuelve null para un valor que no es Error", () => {
    expect(respuestaDeErrorDeDominio("no soy un error")).toBeNull();
  });

  it("usa el status y el mensaje del propio error cuando la tabla no fija uno", async () => {
    const response = respuestaDeErrorDeDominio(
      new GrupoNoEncontradoError("a1", "g1")
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(404);
    const json = await response!.json();
    expect(json.error).toBe("Grupo no encontrado");
  });

  it("usa el mensaje fijo de la tabla cuando está definido, no el message original", async () => {
    const response = respuestaDeErrorDeDominio(
      new InscripcionesCerradasError("a1")
    );
    expect(response!.status).toBe(409);
    const json = await response!.json();
    expect(json.error).toBe("Las inscripciones a grupos están cerradas");
  });

  it("mapea AssignmentNoEncontradoError a 404", async () => {
    const response = respuestaDeErrorDeDominio(
      new AssignmentNoEncontradoError("a1")
    );
    expect(response!.status).toBe(404);
  });

  it("mapea AssignmentNoGrupalError a 400 con mensaje fijo", async () => {
    const response = respuestaDeErrorDeDominio(
      new AssignmentNoGrupalError("a1")
    );
    expect(response!.status).toBe(400);
    const json = await response!.json();
    expect(json.error).toBe("Este assignment no es grupal");
  });

  it("mapea NombreGrupoInvalidoError a 400 usando su propio mensaje", async () => {
    const response = respuestaDeErrorDeDominio(
      new NombreGrupoInvalidoError("+++")
    );
    expect(response!.status).toBe(400);
  });

  it("mapea ColaboradorNoInvitableError a 409 usando su propio mensaje", async () => {
    const error = new ColaboradorNoInvitableError("juangarcia");
    const response = respuestaDeErrorDeDominio(error);
    expect(response!.status).toBe(409);
    const json = await response!.json();
    expect(json.error).toBe(error.message);
    expect(json.error).toContain("@juangarcia");
  });

  it("mapea PermisosNoVerificablesError a 503 con el mensaje amigable", async () => {
    const response = respuestaDeErrorDeDominio(
      new PermisosNoVerificablesError(new Error("DB caída"))
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(503);
    const json = await response!.json();
    expect(json.error).toBe(
      "No se pudieron verificar tus permisos. Reintentá en unos segundos."
    );
  });

  // Issue #92: 403 de la API de Sheets (service account sin rol Editor).
  describe("PlanillaNoDisponibleError", () => {
    const errorDePlanilla = () =>
      new PlanillaNoDisponibleError(new Error("The caller does not have permission"));

    it("mapea a 503 con el mensaje amigable, sin filtrar el mensaje del SDK", async () => {
      const response = respuestaDeErrorDeDominio(errorDePlanilla());
      expect(response).not.toBeNull();
      expect(response!.status).toBe(503);
      const json = await response!.json();
      expect(json.error).toBe(
        "Tus datos quedaron guardados, pero no pudimos actualizar la planilla de la cátedra. Reintentá en unos minutos y, si persiste, avisale a un docente."
      );
      expect(json.error).not.toContain("The caller does not have permission");
    });

    it("con { route, context } loguea con logger.error y programa la persistencia en error_log", async () => {
      const context = { githubUsername: "juangarcia", legajo: "123456" };

      const response = respuestaDeErrorDeDominio(errorDePlanilla(), {
        route: "POST /api/registro",
        context,
      });

      expect(response!.status).toBe(503);
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({ ...context, route: "POST /api/registro" }),
        "handler error"
      );
      expect(mockAfter).toHaveBeenCalledWith(expect.any(Function));

      await mockAfter.mock.calls[0]![0]();

      expect(mockRegistrarErrorInesperado).toHaveBeenCalledWith(
        expect.objectContaining({
          route: "POST /api/registro",
          message: expect.stringContaining("No se pudo escribir en la planilla"),
          context: expect.objectContaining({ githubUsername: "juangarcia" }),
        })
      );
    });

    it("sin segundo parámetro no loguea ni persiste", () => {
      respuestaDeErrorDeDominio(errorDePlanilla());
      expect(mockLoggerError).not.toHaveBeenCalled();
      expect(mockAfter).not.toHaveBeenCalled();
    });
  });

  it("un error de dominio sin `registrar` (PermisosNoVerificablesError) con { route, context } no loguea ni persiste", () => {
    respuestaDeErrorDeDominio(new PermisosNoVerificablesError(new Error("DB caída")), {
      route: "POST /api/registro",
      context: { githubUsername: "juangarcia" },
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });
});
