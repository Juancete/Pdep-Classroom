import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireResponsable = vi.fn();
const mockCrearDocente = vi.fn();
const mockRenombrarDocente = vi.fn();
const mockCambiarEstadoDocente = vi.fn();
const mockRevalidatePath = vi.fn();
const mockLoggerError = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: { error: (...args: unknown[]) => mockLoggerError(...args) },
}));

vi.mock("@/infrastructure/auth/session", () => ({
  requireResponsable: () => mockRequireResponsable(),
}));

const { FakeDocenteDuplicadoError, FakeDocenteProtegidoError, FakeDocenteNoEncontradoError } = vi.hoisted(() => {
  class FakeDocenteNoEncontradoError extends Error {
    constructor() {
      super("El docente no existe.");
    }
  }
  class FakeDocenteDuplicadoError extends Error {
    constructor(
      public readonly githubUsername: string,
      public readonly existenteInactivo: boolean
    ) {
      super(
        existenteInactivo
          ? `Ya existe un docente con el usuario @${githubUsername}, pero está desactivado. Reactivalo en vez de crear uno nuevo.`
          : `Ya existe un docente con el usuario @${githubUsername}.`
      );
      this.name = "DocenteDuplicadoError";
    }
  }
  class FakeDocenteProtegidoError extends Error {
    constructor(public readonly githubUsername: string) {
      super(
        `@${githubUsername} es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.`
      );
      this.name = "DocenteProtegidoError";
    }
  }
  return { FakeDocenteDuplicadoError, FakeDocenteProtegidoError, FakeDocenteNoEncontradoError };
});

vi.mock("@/infrastructure/repositories", () => ({
  crearDocente: (...args: unknown[]) => mockCrearDocente(...args),
  renombrarDocente: (...args: unknown[]) => mockRenombrarDocente(...args),
  cambiarEstadoDocente: (...args: unknown[]) => mockCambiarEstadoDocente(...args),
  DocenteDuplicadoError: FakeDocenteDuplicadoError,
  DocenteProtegidoError: FakeDocenteProtegidoError,
  DocenteNoEncontradoError: FakeDocenteNoEncontradoError,
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import {
  crearDocenteAction,
  renombrarDocenteAction,
  cambiarEstadoDocenteAction,
} from "./actions";
// No se mockea `@/domain/entities`: `DocenteInvalidoError` es la
// clase real, la misma que usa `actions.ts` para reconocer errores
// conocidos del ABM (ver `esErrorConocidoDelAbm`).
import { DocenteInvalidoError } from "@/domain/entities";

// ── Helpers ──────────────────────────────────────────────────

function makeFormData(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.append(key, value);
  }
  return fd;
}

// ── Tests ────────────────────────────────────────────────────

describe("crearDocenteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue({ githubUsername: "juancete" });
    mockCrearDocente.mockResolvedValue({ id: "a1" });
  });

  it("siempre llama a requireResponsable", async () => {
    await crearDocenteAction(null, makeFormData({ githubUsername: "ayudante1" }));
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("pasa el username tal cual (la normalización final queda del lado del repositorio/entidad) y quién lo dio de alta", async () => {
    await crearDocenteAction(
      null,
      makeFormData({ githubUsername: " Ayudante1 ", nombre: "Ana" })
    );
    expect(mockCrearDocente).toHaveBeenCalledWith({
      githubUsername: " Ayudante1 ",
      nombre: "Ana",
      porUsuario: "juancete",
    });
  });

  it("revalida /admin/docentes y devuelve ok:true", async () => {
    const result = await crearDocenteAction(null, makeFormData({ githubUsername: "ayudante1" }));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/docentes");
    expect(result).toEqual({ ok: true });
  });

  it("rechaza un username vacío sin llegar al repositorio", async () => {
    const result = await crearDocenteAction(null, makeFormData({ githubUsername: "" }));
    expect(result).toMatchObject({ ok: false });
    expect(mockCrearDocente).not.toHaveBeenCalled();
  });

  it("rechaza un formato inválido de username", async () => {
    const result = await crearDocenteAction(null, makeFormData({ githubUsername: "-malo" }));
    expect(result).toEqual({
      ok: false,
      errors: { githubUsername: ["El usuario de GitHub no tiene un formato válido"] },
      valores: { githubUsername: "-malo", nombre: "" },
    });
    expect(mockCrearDocente).not.toHaveBeenCalled();
  });

  it("rechaza un nombre de 256 caracteres sin llegar al repositorio", async () => {
    const result = await crearDocenteAction(
      null,
      makeFormData({ githubUsername: "ayudante1", nombre: "a".repeat(256) })
    );
    expect(result).toEqual({
      ok: false,
      errors: { nombre: ["El nombre no puede superar los 255 caracteres"] },
      valores: { githubUsername: "ayudante1", nombre: "a".repeat(256) },
    });
    expect(mockCrearDocente).not.toHaveBeenCalled();
  });

  it("traduce DocenteDuplicadoError a un error de campo", async () => {
    mockCrearDocente.mockRejectedValue(new FakeDocenteDuplicadoError("ayudante1", false));
    const result = await crearDocenteAction(null, makeFormData({ githubUsername: "ayudante1" }));
    expect(result).toEqual({
      ok: false,
      errors: { githubUsername: ["Ya existe un docente con el usuario @ayudante1."] },
      valores: { githubUsername: "ayudante1", nombre: "" },
    });
  });

  it("traduce DocenteProtegidoError (username ya responsable por entorno) a un error de campo", async () => {
    mockCrearDocente.mockRejectedValue(new FakeDocenteProtegidoError("juancete"));
    const result = await crearDocenteAction(null, makeFormData({ githubUsername: "juancete" }));
    expect(result).toEqual({
      ok: false,
      errors: {
        githubUsername: [
          "@juancete es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.",
        ],
      },
      valores: { githubUsername: "juancete", nombre: "" },
    });
  });

  it("propaga un error inesperado del repositorio", async () => {
    mockCrearDocente.mockRejectedValue(new Error("DB caída"));
    await expect(
      crearDocenteAction(null, makeFormData({ githubUsername: "ayudante1" }))
    ).rejects.toThrow("DB caída");
  });
});

describe("renombrarDocenteAction", () => {
  const idValido = "33333333-3333-3333-3333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue({ githubUsername: "juancete" });
    mockRenombrarDocente.mockResolvedValue({ id: idValido });
  });

  it("siempre llama a requireResponsable", async () => {
    await renombrarDocenteAction(null, makeFormData({ id: idValido, nombre: "Nuevo" }));
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("delega en el repositorio con quién hizo el cambio", async () => {
    await renombrarDocenteAction(null, makeFormData({ id: idValido, nombre: "Nuevo" }));
    expect(mockRenombrarDocente).toHaveBeenCalledWith(idValido, "Nuevo", "juancete");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/docentes");
  });

  it("devuelve un error de campo sin llegar al repositorio cuando el id no es un uuid", async () => {
    const result = await renombrarDocenteAction(null, makeFormData({ id: "a1", nombre: "Nuevo" }));
    expect(result).toMatchObject({ ok: false });
    expect(mockRenombrarDocente).not.toHaveBeenCalled();
  });

  it("rechaza un nombre de 256 caracteres sin llegar al repositorio (pre-chequeo de dominio)", async () => {
    const result = await renombrarDocenteAction(
      null,
      makeFormData({ id: idValido, nombre: "a".repeat(256) })
    );
    expect(result).toEqual({
      ok: false,
      errors: { nombre: ["El nombre no puede superar los 255 caracteres"] },
      valores: { nombre: "a".repeat(256) },
    });
    expect(mockRenombrarDocente).not.toHaveBeenCalled();
  });

  it("traduce DocenteProtegidoError a un error de campo en nombre", async () => {
    mockRenombrarDocente.mockRejectedValue(new FakeDocenteProtegidoError("juancete"));
    const result = await renombrarDocenteAction(null, makeFormData({ id: idValido, nombre: "Nuevo" }));
    expect(result).toEqual({
      ok: false,
      errors: {
        nombre: [
          "@juancete es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.",
        ],
      },
      valores: { nombre: "Nuevo" },
    });
  });

  // Regresión: antes sólo se capturaba `DocenteProtegidoError`, así
  // que un docente borrado entre el render y el submit (o cualquier otra
  // ruta que dispare `DocenteNoEncontradoError`) reventaba la página
  // en vez de mostrar un error de campo.
  it("traduce DocenteNoEncontradoError a un error de campo en nombre, sin reventar", async () => {
    mockRenombrarDocente.mockRejectedValue(new FakeDocenteNoEncontradoError());
    const result = await renombrarDocenteAction(null, makeFormData({ id: idValido, nombre: "Nuevo" }));
    expect(result).toEqual({
      ok: false,
      errors: { nombre: ["El docente no existe."] },
      valores: { nombre: "Nuevo" },
    });
  });

  it("traduce DocenteInvalidoError a un error de campo en nombre, sin reventar", async () => {
    mockRenombrarDocente.mockRejectedValue(new DocenteInvalidoError("motivo inválido"));
    const result = await renombrarDocenteAction(null, makeFormData({ id: idValido, nombre: "Nuevo" }));
    expect(result).toEqual({
      ok: false,
      errors: { nombre: ["motivo inválido"] },
      valores: { nombre: "Nuevo" },
    });
  });

  it("propaga un error inesperado del repositorio", async () => {
    mockRenombrarDocente.mockRejectedValue(new Error("DB caída"));
    await expect(
      renombrarDocenteAction(null, makeFormData({ id: idValido, nombre: "Nuevo" }))
    ).rejects.toThrow("DB caída");
  });
});

describe("cambiarEstadoDocenteAction", () => {
  const idValido = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue({ githubUsername: "juancete" });
  });

  it("siempre llama a requireResponsable", async () => {
    mockCambiarEstadoDocente.mockResolvedValue({ id: idValido });
    await cambiarEstadoDocenteAction(idValido, false);
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("delega en el repositorio y revalida", async () => {
    mockCambiarEstadoDocente.mockResolvedValue({ id: idValido });
    const result = await cambiarEstadoDocenteAction(idValido, false);
    expect(mockCambiarEstadoDocente).toHaveBeenCalledWith(idValido, false, "juancete");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/docentes");
    expect(result).toEqual({ ok: true });
  });

  it("oculta errores inesperados y registra el detalle sólo en el servidor", async () => {
    const error = new Error("SQL connection failed: private-db.internal");
    mockCambiarEstadoDocente.mockRejectedValue(error);
    const result = await cambiarEstadoDocenteAction(idValido, true);
    expect(result).toEqual({ ok: false, error: "No se pudo cambiar el estado del docente. Reintentá en unos segundos." });
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: error, docenteId: idValido },
      expect.any(String)
    );
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("conserva el mensaje del error conocido de docente inexistente", async () => {
    mockCambiarEstadoDocente.mockRejectedValue(new FakeDocenteNoEncontradoError());
    expect(await cambiarEstadoDocenteAction(idValido, true)).toEqual({
      ok: false, error: "El docente no existe.",
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("devuelve un error controlado (no una excepción) cuando el repositorio rechaza por ser protegido", async () => {
    mockCambiarEstadoDocente.mockRejectedValue(new FakeDocenteProtegidoError("juancete"));
    const result = await cambiarEstadoDocenteAction(idValido, false);
    expect(result).toEqual({
      ok: false,
      error:
        "@juancete es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.",
    });
  });

  // Regresión: la lista de errores conocidos del ABM es una sola
  // (`ERRORES_CONOCIDOS_DEL_ABM`) compartida por las tres actions — acá se
  // verifica que Duplicado e Inválido, no sólo Protegido/NoEncontrado, se
  // devuelven como `{ ok: false, error }` en vez de loguearse como
  // inesperados.
  it("devuelve un error controlado (sin loguear) cuando el repositorio rechaza por duplicado", async () => {
    mockCambiarEstadoDocente.mockRejectedValue(new FakeDocenteDuplicadoError("ayudante1", false));
    const result = await cambiarEstadoDocenteAction(idValido, true);
    expect(result).toEqual({
      ok: false,
      error: "Ya existe un docente con el usuario @ayudante1.",
    });
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("devuelve un error controlado (sin loguear) cuando el repositorio rechaza por inválido", async () => {
    mockCambiarEstadoDocente.mockRejectedValue(new DocenteInvalidoError("motivo inválido"));
    const result = await cambiarEstadoDocenteAction(idValido, true);
    expect(result).toEqual({ ok: false, error: "motivo inválido" });
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("devuelve 'Datos inválidos' sin llamar al repositorio cuando el id no es un uuid", async () => {
    const result = await cambiarEstadoDocenteAction("no-es-uuid", true);
    expect(result).toEqual({ ok: false, error: "Datos inválidos" });
    expect(mockCambiarEstadoDocente).not.toHaveBeenCalled();
  });

  it("devuelve 'Datos inválidos' sin llamar al repositorio cuando activo no es un boolean real", async () => {
    const result = await cambiarEstadoDocenteAction(
      idValido,
      "false" as unknown as boolean
    );
    expect(result).toEqual({ ok: false, error: "Datos inválidos" });
    expect(mockCambiarEstadoDocente).not.toHaveBeenCalled();
  });
});
