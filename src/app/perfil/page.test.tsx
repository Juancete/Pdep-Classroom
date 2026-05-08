import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import { Alumno } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockAuth = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockVerificarConsistenciaAlumno = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();
const mockRedirect = vi.fn().mockImplementation((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
  getComisionActiva: () => mockGetComisionActiva(),
}));

vi.mock("@/lib/services/verificarConsistenciaAlumno", () => ({
  verificarConsistenciaAlumno: (...args: unknown[]) =>
    mockVerificarConsistenciaAlumno(...args),
}));

vi.mock("@/lib/services/intentarSincronizarGrupos", () => ({
  intentarSincronizarGrupos: (...args: unknown[]) =>
    mockIntentarSincronizarGrupos(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/app/components/AlumnoForm", () => ({
  AlumnoForm: ({ defaultValues }: { defaultValues: { githubUsername: string; legajo?: string; email?: string } }) => (
    <div
      data-testid="alumno-form"
      data-github={defaultValues.githubUsername}
      data-legajo={defaultValues.legajo ?? ""}
      data-email={defaultValues.email ?? ""}
    />
  ),
}));

import PerfilPage from "./page";

// ── Helpers ──────────────────────────────────────────────────

function makeSession(githubUsername: string) {
  const pdepUser: PdepUser = {
    githubUsername,
    name: "Test User",
    image: "",
    isAdmin: false,
  };
  return {
    pdepUser,
    user: { email: "test@example.com", name: "Test User" },
  };
}

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  const alumno = new Alumno();
  alumno.id = "uuid-1";
  alumno.legajo = "12345";
  alumno.nombre = "Juan";
  alumno.apellido = "Garcia";
  alumno.githubUsername = "juangarcia";
  alumno.email = "juan@example.com";
  alumno.gruposSyncFallidoEn = null;
  alumno.alumnoSyncFallidoEn = null;
  return Object.assign(alumno, overrides);
}

const comisionActiva = { id: "c1", spreadsheetId: "sheet-xyz" };

// ── Tests ────────────────────────────────────────────────────

describe("Perfil page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetComisionActiva.mockResolvedValue(comisionActiva);
    mockVerificarConsistenciaAlumno.mockResolvedValue(undefined);
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  describe("redirecciones", () => {
    it("redirige a /login si no hay sesión", async () => {
      mockAuth.mockResolvedValue(null);

      await expect(PerfilPage()).rejects.toThrow("REDIRECT:/login");
      expect(mockRedirect).toHaveBeenCalledWith("/login");
    });

    it("redirige a /registro si el alumno no está en la DB", async () => {
      mockAuth.mockResolvedValue(makeSession("nuevo"));
      mockGetAlumnoByGithub.mockResolvedValue(null);

      await expect(PerfilPage()).rejects.toThrow("REDIRECT:/registro");
      expect(mockRedirect).toHaveBeenCalledWith("/registro");
    });
  });

  describe("render cuando el alumno existe", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(makeSession("juangarcia"));
      mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    });

    it("muestra el título Mi perfil", async () => {
      const element = await PerfilPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Mi perfil");
    });

    it("renderiza el AlumnoForm", async () => {
      const element = await PerfilPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="alumno-form"');
    });

    it("pasa los datos del alumno al AlumnoForm", async () => {
      const element = await PerfilPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-github="juangarcia"');
      expect(html).toContain('data-legajo="12345"');
      expect(html).toContain('data-email="juan@example.com"');
    });

    it("consulta getAlumnoByGithub de la DB con el username de la sesión", async () => {
      await PerfilPage();
      expect(mockGetAlumnoByGithub).toHaveBeenCalledWith("juangarcia");
    });
  });

  describe("reintento manual on-demand al montar", () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue(makeSession("juangarcia"));
    });

    it("no dispara ninguna sync si ningún flag está prendido", async () => {
      mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
      await PerfilPage();
      expect(mockVerificarConsistenciaAlumno).not.toHaveBeenCalled();
      expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
    });

    it("llama a verificarConsistenciaAlumno si alumnoSyncFallidoEn está prendido", async () => {
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ alumnoSyncFallidoEn: new Date("2026-04-01") })
      );
      await PerfilPage();
      expect(mockVerificarConsistenciaAlumno).toHaveBeenCalledWith(
        "juangarcia",
        comisionActiva
      );
      expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
    });

    it("llama a intentarSincronizarGrupos si gruposSyncFallidoEn está prendido", async () => {
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ gruposSyncFallidoEn: new Date("2026-04-01") })
      );
      await PerfilPage();
      expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith(
        "juangarcia",
        comisionActiva
      );
      expect(mockVerificarConsistenciaAlumno).not.toHaveBeenCalled();
    });

    it("llama a ambas funciones si los dos flags están prendidos", async () => {
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({
          alumnoSyncFallidoEn: new Date("2026-04-01"),
          gruposSyncFallidoEn: new Date("2026-04-01"),
        })
      );
      await PerfilPage();
      expect(mockVerificarConsistenciaAlumno).toHaveBeenCalledWith(
        "juangarcia",
        comisionActiva
      );
      expect(mockIntentarSincronizarGrupos).toHaveBeenCalledWith(
        "juangarcia",
        comisionActiva
      );
    });

    it("no dispara sync si no hay comisión activa", async () => {
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ gruposSyncFallidoEn: new Date("2026-04-01") })
      );
      mockGetComisionActiva.mockResolvedValue(null);
      await PerfilPage();
      expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
    });

    it("no rompe el render si alguna sync throwea", async () => {
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ gruposSyncFallidoEn: new Date("2026-04-01") })
      );
      mockIntentarSincronizarGrupos.mockRejectedValue(new Error("Sheets caído"));

      await expect(PerfilPage()).resolves.toBeDefined();
    });
  });
});
