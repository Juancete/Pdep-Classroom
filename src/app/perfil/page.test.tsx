import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PdepUser } from "@/types";
import { Alumno, Comision, ESTUDIANTE } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockAuth = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockGetComisionActiva = vi.fn();
const mockVerificarConsistenciaAlumno = vi.fn();
const mockIntentarSincronizarGrupos = vi.fn();
const mockResolverEstadoDeSincronizacion = vi.fn();
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

vi.mock("@/lib/services/estadoDeSincronizacion", () => ({
  resolverEstadoDeSincronizacion: (...args: unknown[]) =>
    mockResolverEstadoDeSincronizacion(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/components/AlumnoForm", () => ({
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
    rol: ESTUDIANTE,
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

const comisionActiva = Object.assign(new Comision(2026, "sheet-xyz"), { id: "c1" });

/** Doble mínimo de un canal pendiente para inyectar en el mock de estadoDeSincronizacion. */
function makeCanalPendiente(sincronizar = vi.fn().mockResolvedValue({ estado: "sincronizada" })) {
  return { nombre: "google_groups", asuntoPendiente: () => "suscribirte al grupo de Google del curso", sincronizar };
}

// ── Tests ────────────────────────────────────────────────────

describe("Perfil page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetComisionActiva.mockResolvedValue(comisionActiva);
    mockVerificarConsistenciaAlumno.mockResolvedValue(undefined);
    mockIntentarSincronizarGrupos.mockResolvedValue(undefined);
    // Por defecto refleja los flags propios del alumno (asuntosDeSyncPendientes)
    // y no aporta canales pendientes — se sobreescribe puntualmente donde hace falta.
    mockResolverEstadoDeSincronizacion.mockImplementation(async (alumno: Alumno) => ({
      hayPendientes: alumno.asuntosDeSyncPendientes().length > 0,
      mensaje: "",
      canalesPendientes: [],
    }));
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

    it("no dispara ninguna sync si nada está pendiente", async () => {
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

    it("reintenta un canal pendiente llamando a canal.sincronizar", async () => {
      const sincronizar = vi.fn().mockResolvedValue({ estado: "sincronizada" });
      mockResolverEstadoDeSincronizacion.mockResolvedValue({
        hayPendientes: true,
        mensaje: "No pudimos suscribirte al grupo de Google del curso.",
        canalesPendientes: [makeCanalPendiente(sincronizar)],
      });
      mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());

      await PerfilPage();

      expect(sincronizar).toHaveBeenCalledWith("juangarcia");
    });

    it("no llama a sincronizar cuando no hay canales pendientes", async () => {
      const sincronizar = vi.fn();
      mockResolverEstadoDeSincronizacion.mockResolvedValue({
        hayPendientes: false,
        mensaje: "",
        canalesPendientes: [],
      });
      mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());

      await PerfilPage();

      expect(sincronizar).not.toHaveBeenCalled();
    });

    it("reintenta el canal pendiente aunque falle getComisionActiva", async () => {
      const sincronizar = vi.fn().mockResolvedValue({ estado: "sincronizada" });
      mockResolverEstadoDeSincronizacion.mockResolvedValue({
        hayPendientes: true,
        mensaje: "",
        canalesPendientes: [makeCanalPendiente(sincronizar)],
      });
      mockGetAlumnoByGithub.mockResolvedValue(
        makeAlumno({ gruposSyncFallidoEn: new Date("2026-04-01") })
      );
      mockGetComisionActiva.mockRejectedValue(new Error("DB caída"));

      await expect(PerfilPage()).resolves.toBeDefined();

      expect(sincronizar).toHaveBeenCalledWith("juangarcia");
      expect(mockIntentarSincronizarGrupos).not.toHaveBeenCalled();
    });
  });
});
