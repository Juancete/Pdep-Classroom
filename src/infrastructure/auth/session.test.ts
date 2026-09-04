import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`redirect:${url}`);
});

vi.mock("@/infrastructure/auth/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

import { getCurrentUser, requireUser, requireAdmin } from "./session";

function sessionConRol(githubUsername: string, rolNombre: "docente" | "alumno") {
  return {
    pdepUser: { githubUsername, name: githubUsername, image: "", rolNombre },
  };
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

  it("reconstruye un RolDeUsuario real a partir de rolNombre='docente'", async () => {
    // Regresión: si el objeto de sesión trajera `rol` como una instancia ya
    // clonada por Auth.js (un objeto vacío sin métodos), este test no lo
    // detectaría — por eso la sesión mockeada acá sólo tiene `rolNombre`,
    // igual que lo que Auth.js realmente entrega.
    mockAuth.mockResolvedValue(sessionConRol("juancete", "docente"));
    const user = await getCurrentUser();
    expect(user?.rol.puedeAdministrar()).toBe(true);
    expect(user?.rol.veBannerDeSincronizacion()).toBe(false);
  });

  it("reconstruye un RolDeUsuario real a partir de rolNombre='alumno'", async () => {
    mockAuth.mockResolvedValue(sessionConRol("ana", "alumno"));
    const user = await getCurrentUser();
    expect(user?.rol.puedeAdministrar()).toBe(false);
    expect(user?.rol.veBannerDeSincronizacion()).toBe(true);
  });

  it("propaga githubUsername, name e image sin tocarlos", async () => {
    mockAuth.mockResolvedValue({
      pdepUser: { githubUsername: "ana", name: "Ana García", image: "https://x", rolNombre: "alumno" },
    });
    const user = await getCurrentUser();
    expect(user).toMatchObject({ githubUsername: "ana", name: "Ana García", image: "https://x" });
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
    mockAuth.mockResolvedValue(sessionConRol("ana", "alumno"));
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

  it("redirige a /dashboard si el usuario no es docente", async () => {
    mockAuth.mockResolvedValue(sessionConRol("ana", "alumno"));
    await expect(requireAdmin()).rejects.toThrow("redirect:/dashboard");
  });

  it("devuelve el usuario si es docente", async () => {
    mockAuth.mockResolvedValue(sessionConRol("juancete", "docente"));
    const user = await requireAdmin();
    expect(user.githubUsername).toBe("juancete");
  });
});
