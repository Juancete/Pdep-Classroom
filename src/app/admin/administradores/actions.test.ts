import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireResponsable = vi.fn();
const mockCrearAdministrador = vi.fn();
const mockRenombrarAdministrador = vi.fn();
const mockCambiarEstadoAdministrador = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireResponsable: () => mockRequireResponsable(),
}));

const { FakeAdministradorDuplicadoError, FakeAdministradorProtegidoError } = vi.hoisted(() => {
  class FakeAdministradorDuplicadoError extends Error {
    constructor(
      public readonly githubUsername: string,
      public readonly existenteInactivo: boolean
    ) {
      super(
        existenteInactivo
          ? `Ya existe un administrador con el usuario @${githubUsername}, pero está desactivado. Reactivalo en vez de crear uno nuevo.`
          : `Ya existe un administrador con el usuario @${githubUsername}.`
      );
      this.name = "AdministradorDuplicadoError";
    }
  }
  class FakeAdministradorProtegidoError extends Error {
    constructor(public readonly githubUsername: string) {
      super(
        `@${githubUsername} es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.`
      );
      this.name = "AdministradorProtegidoError";
    }
  }
  return { FakeAdministradorDuplicadoError, FakeAdministradorProtegidoError };
});

vi.mock("@/infrastructure/repositories", () => ({
  crearAdministrador: (...args: unknown[]) => mockCrearAdministrador(...args),
  renombrarAdministrador: (...args: unknown[]) => mockRenombrarAdministrador(...args),
  cambiarEstadoAdministrador: (...args: unknown[]) => mockCambiarEstadoAdministrador(...args),
  AdministradorDuplicadoError: FakeAdministradorDuplicadoError,
  AdministradorProtegidoError: FakeAdministradorProtegidoError,
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

import {
  crearAdministradorAction,
  renombrarAdministradorAction,
  cambiarEstadoAdministradorAction,
} from "./actions";

// ── Helpers ──────────────────────────────────────────────────

function makeFormData(fields: Record<string, string | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) fd.append(key, value);
  }
  return fd;
}

// ── Tests ────────────────────────────────────────────────────

describe("crearAdministradorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue({ githubUsername: "juancete" });
    mockCrearAdministrador.mockResolvedValue({ id: "a1" });
  });

  it("siempre llama a requireResponsable", async () => {
    await crearAdministradorAction(null, makeFormData({ githubUsername: "ayudante1" }));
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("pasa el username tal cual (la normalización final queda del lado del repositorio/entidad) y quién lo dio de alta", async () => {
    await crearAdministradorAction(
      null,
      makeFormData({ githubUsername: " Ayudante1 ", nombre: "Ana" })
    );
    expect(mockCrearAdministrador).toHaveBeenCalledWith({
      githubUsername: " Ayudante1 ",
      nombre: "Ana",
      porUsuario: "juancete",
    });
  });

  it("revalida /admin/administradores y devuelve ok:true", async () => {
    const result = await crearAdministradorAction(null, makeFormData({ githubUsername: "ayudante1" }));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/administradores");
    expect(result).toEqual({ ok: true });
  });

  it("rechaza un username vacío sin llegar al repositorio", async () => {
    const result = await crearAdministradorAction(null, makeFormData({ githubUsername: "" }));
    expect(result).toMatchObject({ ok: false });
    expect(mockCrearAdministrador).not.toHaveBeenCalled();
  });

  it("rechaza un formato inválido de username", async () => {
    const result = await crearAdministradorAction(null, makeFormData({ githubUsername: "-malo" }));
    expect(result).toEqual({
      ok: false,
      errors: { githubUsername: ["El usuario de GitHub no tiene un formato válido"] },
      valores: { githubUsername: "-malo", nombre: "" },
    });
    expect(mockCrearAdministrador).not.toHaveBeenCalled();
  });

  it("rechaza un nombre de 256 caracteres sin llegar al repositorio", async () => {
    const result = await crearAdministradorAction(
      null,
      makeFormData({ githubUsername: "ayudante1", nombre: "a".repeat(256) })
    );
    expect(result).toEqual({
      ok: false,
      errors: { nombre: ["El nombre no puede superar los 255 caracteres"] },
      valores: { githubUsername: "ayudante1", nombre: "a".repeat(256) },
    });
    expect(mockCrearAdministrador).not.toHaveBeenCalled();
  });

  it("traduce AdministradorDuplicadoError a un error de campo", async () => {
    mockCrearAdministrador.mockRejectedValue(new FakeAdministradorDuplicadoError("ayudante1", false));
    const result = await crearAdministradorAction(null, makeFormData({ githubUsername: "ayudante1" }));
    expect(result).toEqual({
      ok: false,
      errors: { githubUsername: ["Ya existe un administrador con el usuario @ayudante1."] },
      valores: { githubUsername: "ayudante1", nombre: "" },
    });
  });

  it("traduce AdministradorProtegidoError (username ya responsable por entorno) a un error de campo", async () => {
    mockCrearAdministrador.mockRejectedValue(new FakeAdministradorProtegidoError("juancete"));
    const result = await crearAdministradorAction(null, makeFormData({ githubUsername: "juancete" }));
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
    mockCrearAdministrador.mockRejectedValue(new Error("DB caída"));
    await expect(
      crearAdministradorAction(null, makeFormData({ githubUsername: "ayudante1" }))
    ).rejects.toThrow("DB caída");
  });
});

describe("renombrarAdministradorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue({ githubUsername: "juancete" });
    mockRenombrarAdministrador.mockResolvedValue({ id: "a1" });
  });

  it("siempre llama a requireResponsable", async () => {
    await renombrarAdministradorAction(null, makeFormData({ id: "a1", nombre: "Nuevo" }));
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("delega en el repositorio con quién hizo el cambio", async () => {
    await renombrarAdministradorAction(null, makeFormData({ id: "a1", nombre: "Nuevo" }));
    expect(mockRenombrarAdministrador).toHaveBeenCalledWith("a1", "Nuevo", "juancete");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/administradores");
  });

  it("rechaza un nombre de 256 caracteres sin llegar al repositorio", async () => {
    const result = await renombrarAdministradorAction(
      null,
      makeFormData({ id: "a1", nombre: "a".repeat(256) })
    );
    expect(result).toEqual({
      ok: false,
      errors: { nombre: ["El nombre no puede superar los 255 caracteres"] },
      valores: { nombre: "a".repeat(256) },
    });
    expect(mockRenombrarAdministrador).not.toHaveBeenCalled();
  });

  it("traduce AdministradorProtegidoError a un error de campo en nombre", async () => {
    mockRenombrarAdministrador.mockRejectedValue(new FakeAdministradorProtegidoError("juancete"));
    const result = await renombrarAdministradorAction(null, makeFormData({ id: "a1", nombre: "Nuevo" }));
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

  it("propaga un error inesperado del repositorio", async () => {
    mockRenombrarAdministrador.mockRejectedValue(new Error("DB caída"));
    await expect(
      renombrarAdministradorAction(null, makeFormData({ id: "a1", nombre: "Nuevo" }))
    ).rejects.toThrow("DB caída");
  });
});

describe("cambiarEstadoAdministradorAction", () => {
  const idValido = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue({ githubUsername: "juancete" });
  });

  it("siempre llama a requireResponsable", async () => {
    mockCambiarEstadoAdministrador.mockResolvedValue({ id: idValido });
    await cambiarEstadoAdministradorAction(idValido, false);
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("delega en el repositorio y revalida", async () => {
    mockCambiarEstadoAdministrador.mockResolvedValue({ id: idValido });
    const result = await cambiarEstadoAdministradorAction(idValido, false);
    expect(mockCambiarEstadoAdministrador).toHaveBeenCalledWith(idValido, false, "juancete");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/administradores");
    expect(result).toEqual({ ok: true });
  });

  it("devuelve un error controlado si el repositorio falla", async () => {
    mockCambiarEstadoAdministrador.mockRejectedValue(new Error("no encontrado"));
    const result = await cambiarEstadoAdministradorAction(idValido, true);
    expect(result).toEqual({ ok: false, error: "no encontrado" });
  });

  it("devuelve un error controlado (no una excepción) cuando el repositorio rechaza por ser protegido", async () => {
    mockCambiarEstadoAdministrador.mockRejectedValue(new FakeAdministradorProtegidoError("juancete"));
    const result = await cambiarEstadoAdministradorAction(idValido, false);
    expect(result).toEqual({
      ok: false,
      error:
        "@juancete es responsable por configuración del entorno (ADMIN_GITHUB_USERNAMES) y no se puede gestionar desde la aplicación.",
    });
  });

  it("devuelve 'Datos inválidos' sin llamar al repositorio cuando el id no es un uuid", async () => {
    const result = await cambiarEstadoAdministradorAction("no-es-uuid", true);
    expect(result).toEqual({ ok: false, error: "Datos inválidos" });
    expect(mockCambiarEstadoAdministrador).not.toHaveBeenCalled();
  });

  it("devuelve 'Datos inválidos' sin llamar al repositorio cuando activo no es un boolean real", async () => {
    const result = await cambiarEstadoAdministradorAction(
      idValido,
      "false" as unknown as boolean
    );
    expect(result).toEqual({ ok: false, error: "Datos inválidos" });
    expect(mockCambiarEstadoAdministrador).not.toHaveBeenCalled();
  });
});
