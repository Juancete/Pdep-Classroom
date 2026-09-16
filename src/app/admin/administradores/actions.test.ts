import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────

const mockRequireResponsable = vi.fn();
const mockCrearAdministrador = vi.fn();
const mockRenombrarAdministrador = vi.fn();
const mockCambiarEstadoAdministrador = vi.fn();
const mockEsResponsableDeEntorno = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  requireResponsable: () => mockRequireResponsable(),
}));

const { FakeAdministradorDuplicadoError } = vi.hoisted(() => {
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
  return { FakeAdministradorDuplicadoError };
});

vi.mock("@/infrastructure/repositories", () => ({
  crearAdministrador: (...args: unknown[]) => mockCrearAdministrador(...args),
  renombrarAdministrador: (...args: unknown[]) => mockRenombrarAdministrador(...args),
  cambiarEstadoAdministrador: (...args: unknown[]) => mockCambiarEstadoAdministrador(...args),
  AdministradorDuplicadoError: FakeAdministradorDuplicadoError,
}));

vi.mock("@/lib/responsables-de-entorno", () => ({
  esResponsableDeEntorno: (...args: unknown[]) => mockEsResponsableDeEntorno(...args),
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
    mockEsResponsableDeEntorno.mockReturnValue(false);
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
    });
    expect(mockCrearAdministrador).not.toHaveBeenCalled();
  });

  it("rechaza un username que ya es responsable por entorno", async () => {
    mockEsResponsableDeEntorno.mockReturnValue(true);
    const result = await crearAdministradorAction(null, makeFormData({ githubUsername: "juancete" }));
    expect(result?.ok).toBe(false);
    expect(mockCrearAdministrador).not.toHaveBeenCalled();
  });

  it("traduce AdministradorDuplicadoError a un error de campo", async () => {
    mockCrearAdministrador.mockRejectedValue(new FakeAdministradorDuplicadoError("ayudante1", false));
    const result = await crearAdministradorAction(null, makeFormData({ githubUsername: "ayudante1" }));
    expect(result).toEqual({
      ok: false,
      errors: { githubUsername: ["Ya existe un administrador con el usuario @ayudante1."] },
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
});

describe("cambiarEstadoAdministradorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireResponsable.mockResolvedValue({ githubUsername: "juancete" });
  });

  it("siempre llama a requireResponsable", async () => {
    mockCambiarEstadoAdministrador.mockResolvedValue({ id: "a1" });
    await cambiarEstadoAdministradorAction("a1", false);
    expect(mockRequireResponsable).toHaveBeenCalledOnce();
  });

  it("delega en el repositorio y revalida", async () => {
    mockCambiarEstadoAdministrador.mockResolvedValue({ id: "a1" });
    const result = await cambiarEstadoAdministradorAction("a1", false);
    expect(mockCambiarEstadoAdministrador).toHaveBeenCalledWith("a1", false, "juancete");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/administradores");
    expect(result).toEqual({ ok: true });
  });

  it("devuelve un error controlado si el repositorio falla", async () => {
    mockCambiarEstadoAdministrador.mockRejectedValue(new Error("no encontrado"));
    const result = await cambiarEstadoAdministradorAction("a1", true);
    expect(result).toEqual({ ok: false, error: "no encontrado" });
  });
});
