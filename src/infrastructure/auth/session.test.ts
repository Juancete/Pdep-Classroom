import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`redirect:${url}`);
});
const mockEsResponsableDeEntorno = vi.fn();
const mockHayDocenteActivo = vi.fn();

vi.mock("@/infrastructure/auth/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/lib/responsables-de-entorno", () => ({
  esResponsableDeEntorno: (githubUsername: string) => mockEsResponsableDeEntorno(githubUsername),
}));

vi.mock("@/infrastructure/repositories", () => ({
  hayDocenteActivo: (githubUsername: string) => mockHayDocenteActivo(githubUsername),
}));

// `getCurrentUser()` memoiza con `cache()` de React dentro de una misma
// llamada a render — como cada test importa el módulo una sola vez a nivel
// de archivo, `resetModules` no hace falta: `cache()` sólo memoiza dentro de
// un mismo "render" de React, y fuera de ese contexto (como acá, en un test
// que llama directo a la función) cada invocación vuelve a ejecutar el
// cuerpo. Ver la nota de la librería `react` sobre `cache()` fuera de JSX.
import {
  getCurrentUser,
  requireUser,
  requireAdmin,
  requireResponsable,
  PermisosNoVerificablesError,
} from "./session";

function sessionCon(githubUsername: string) {
  return { pdepUser: { githubUsername, name: githubUsername, image: "" } };
}

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve null si no hay sesión", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });

  it("devuelve null si la sesión no tiene pdepUser", async () => {
    mockAuth.mockResolvedValue({});
    expect(await getCurrentUser()).toBeNull();
  });

  it("resuelve un responsable de entorno sin consultar la tabla de docentes", async () => {
    mockAuth.mockResolvedValue(sessionCon("juancete"));
    mockEsResponsableDeEntorno.mockReturnValue(true);

    const user = await getCurrentUser();

    expect(user?.rol.puedeAdministrar()).toBe(true);
    expect(user?.rol.puedeGestionarDocentes()).toBe(true);
    expect(mockHayDocenteActivo).not.toHaveBeenCalled();
  });

  it("resuelve un docente para un docente activo en base", async () => {
    mockAuth.mockResolvedValue(sessionCon("ayudante1"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(true);

    const user = await getCurrentUser();

    expect(user?.rol.puedeAdministrar()).toBe(true);
    expect(user?.rol.puedeGestionarDocentes()).toBe(false);
    expect(mockHayDocenteActivo).toHaveBeenCalledWith("ayudante1");
  });

  it("resuelve un alumno cuando no es responsable ni docente activo", async () => {
    mockAuth.mockResolvedValue(sessionCon("ana"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(false);

    const user = await getCurrentUser();

    expect(user?.rol.puedeAdministrar()).toBe(false);
    expect(user?.rol.veBannerDeSincronizacion()).toBe(true);
  });

  it("resuelve un alumno para un docente desactivado", async () => {
    mockAuth.mockResolvedValue(sessionCon("ex-ayudante"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(false);

    const user = await getCurrentUser();

    expect(user?.rol.puedeAdministrar()).toBe(false);
  });

  it("propaga githubUsername, name e image sin tocarlos", async () => {
    mockAuth.mockResolvedValue({
      pdepUser: { githubUsername: "ana", name: "Ana García", image: "https://x" },
    });
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(false);

    const user = await getCurrentUser();
    expect(user).toMatchObject({ githubUsername: "ana", name: "Ana García", image: "https://x" });
  });

  it("lanza PermisosNoVerificablesError si falla la consulta de docentes (fail hard, no reutiliza rol anterior)", async () => {
    mockAuth.mockResolvedValue(sessionCon("ana"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockRejectedValue(new Error("DB caída"));

    await expect(getCurrentUser()).rejects.toBeInstanceOf(PermisosNoVerificablesError);
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige a /login si no hay usuario", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("redirect:/login");
  });

  it("devuelve el usuario si hay sesión", async () => {
    mockAuth.mockResolvedValue(sessionCon("ana"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(false);

    const user = await requireUser();
    expect(user.githubUsername).toBe("ana");
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige a /login si no hay usuario", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("redirect:/login");
  });

  it("redirige a /dashboard si el usuario no es docente ni responsable", async () => {
    mockAuth.mockResolvedValue(sessionCon("ana"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(false);

    await expect(requireAdmin()).rejects.toThrow("redirect:/dashboard");
  });

  it("devuelve el usuario si es un docente activo en base", async () => {
    mockAuth.mockResolvedValue(sessionCon("ayudante1"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(true);

    const user = await requireAdmin();
    expect(user.githubUsername).toBe("ayudante1");
  });

  it("devuelve el usuario si es responsable de entorno", async () => {
    mockAuth.mockResolvedValue(sessionCon("juancete"));
    mockEsResponsableDeEntorno.mockReturnValue(true);

    const user = await requireAdmin();
    expect(user.githubUsername).toBe("juancete");
  });
});

describe("requireResponsable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige a /login si no hay usuario", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireResponsable()).rejects.toThrow("redirect:/login");
  });

  it("redirige a /dashboard a un docente de base (no puede gestionar docentes)", async () => {
    mockAuth.mockResolvedValue(sessionCon("ayudante1"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(true);

    await expect(requireResponsable()).rejects.toThrow("redirect:/dashboard");
  });

  it("redirige a /dashboard a un alumno", async () => {
    mockAuth.mockResolvedValue(sessionCon("ana"));
    mockEsResponsableDeEntorno.mockReturnValue(false);
    mockHayDocenteActivo.mockResolvedValue(false);

    await expect(requireResponsable()).rejects.toThrow("redirect:/dashboard");
  });

  it("devuelve el usuario si es responsable de entorno", async () => {
    mockAuth.mockResolvedValue(sessionCon("juancete"));
    mockEsResponsableDeEntorno.mockReturnValue(true);

    const user = await requireResponsable();
    expect(user.githubUsername).toBe("juancete");
  });
});
