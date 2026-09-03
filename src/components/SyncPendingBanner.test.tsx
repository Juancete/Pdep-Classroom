import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Alumno, DOCENTE, ESTUDIANTE } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockResolverEstadoDeSincronizacion = vi.fn();

vi.mock("@/infrastructure/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
}));

vi.mock("@/application/estadoDeSincronizacion", () => ({
  resolverEstadoDeSincronizacion: (...args: unknown[]) =>
    mockResolverEstadoDeSincronizacion(...args),
}));

import { SyncPendingBanner } from "./SyncPendingBanner";

// ── Helpers ──────────────────────────────────────────────────

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  return Object.assign(new Alumno(), {
    id: "uuid-1",
    legajo: "12345",
    nombre: "Juan",
    apellido: "Garcia",
    githubUsername: "juangarcia",
    email: "juan@example.com",
    gruposSyncFallidoEn: null,
    alumnoSyncFallidoEn: null,
    ...overrides,
  });
}

function mockEstado(hayPendientes: boolean, mensaje = "") {
  mockResolverEstadoDeSincronizacion.mockResolvedValue({
    hayPendientes,
    mensaje,
    canalesPendientes: [],
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("SyncPendingBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEstado(false);
  });

  it("no renderiza nada si no hay usuario logueado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const banner = await SyncPendingBanner();
    expect(banner).toBeNull();
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
  });

  it("no renderiza nada si el usuario es admin (no aplica)", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      rol: DOCENTE,
    });
    const banner = await SyncPendingBanner();
    expect(banner).toBeNull();
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
  });

  it("no renderiza nada si el alumno no existe en DB", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      rol: ESTUDIANTE,
    });
    mockGetAlumnoByGithub.mockResolvedValue(null);
    const banner = await SyncPendingBanner();
    expect(banner).toBeNull();
  });

  it("no renderiza nada si no hay nada pendiente", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      rol: ESTUDIANTE,
    });
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockEstado(false);
    const banner = await SyncPendingBanner();
    expect(banner).toBeNull();
  });

  it("renderiza el banner con el mensaje resuelto por el servicio", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      rol: ESTUDIANTE,
    });
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockEstado(true, "No pudimos asignarte a tu grupo de TP desde la planilla.");

    const banner = await SyncPendingBanner();
    const html = renderToStaticMarkup(banner as React.ReactElement);

    expect(html).toContain("No pudimos asignarte a tu grupo de TP");
    expect(html).toContain('href="/perfil"');
    expect(html).toContain("Reintentar");
  });

  it("renderiza el mensaje combinado que devuelve el servicio", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      rol: ESTUDIANTE,
    });
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockEstado(
      true,
      "No pudimos reflejar tus datos de alumno en la planilla ni asignarte a tu grupo de TP desde la planilla."
    );

    const banner = await SyncPendingBanner();
    const html = renderToStaticMarkup(banner as React.ReactElement);

    expect(html).toContain("tus datos");
    expect(html).toContain("grupo de TP");
  });

  it("renderiza un canal de comunicación pendiente", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      rol: ESTUDIANTE,
    });
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    mockEstado(true, "No pudimos suscribirte al grupo de Google del curso.");

    const html = renderToStaticMarkup(
      (await SyncPendingBanner()) as React.ReactElement
    );
    expect(html).toContain("suscribirte al grupo de Google");
    expect(html).toContain('href="/perfil"');
  });
});
