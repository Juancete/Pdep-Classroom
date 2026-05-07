import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Alumno } from "@/domain/entities";

// ── Mocks ────────────────────────────────────────────────────

const mockGetCurrentUser = vi.fn();
const mockGetAlumnoByGithub = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
}));

import { SyncPendingBanner } from "./SyncPendingBanner";

// ── Helpers ──────────────────────────────────────────────────

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  return {
    id: "uuid-1",
    legajo: "12345",
    nombre: "Juan",
    apellido: "Garcia",
    githubUsername: "juangarcia",
    email: "juan@example.com",
    ...overrides,
  } as Alumno;
}

// ── Tests ────────────────────────────────────────────────────

describe("SyncPendingBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      isAdmin: true,
    });
    const banner = await SyncPendingBanner();
    expect(banner).toBeNull();
    expect(mockGetAlumnoByGithub).not.toHaveBeenCalled();
  });

  it("no renderiza nada si el alumno no existe en DB", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      isAdmin: false,
    });
    mockGetAlumnoByGithub.mockResolvedValue(null);
    const banner = await SyncPendingBanner();
    expect(banner).toBeNull();
  });

  it("no renderiza nada si ningún flag está prendido", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      isAdmin: false,
    });
    mockGetAlumnoByGithub.mockResolvedValue(makeAlumno());
    const banner = await SyncPendingBanner();
    expect(banner).toBeNull();
  });

  it("renderiza el banner cuando gruposSyncFallidoEn está prendido", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      isAdmin: false,
    });
    mockGetAlumnoByGithub.mockResolvedValue(
      makeAlumno({ gruposSyncFallidoEn: new Date("2026-04-01") })
    );

    const banner = await SyncPendingBanner();
    const html = renderToStaticMarkup(banner as React.ReactElement);

    expect(html).toContain("No pudimos asignarte a tu grupo de TP");
    expect(html).toContain('href="/perfil"');
    expect(html).toContain("Reintentar");
  });

  it("renderiza el banner cuando alumnoSyncFallidoEn está prendido", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      isAdmin: false,
    });
    mockGetAlumnoByGithub.mockResolvedValue(
      makeAlumno({ alumnoSyncFallidoEn: new Date("2026-04-01") })
    );

    const banner = await SyncPendingBanner();
    const html = renderToStaticMarkup(banner as React.ReactElement);

    expect(html).toContain("No pudimos reflejar tus datos de alumno");
  });

  it("renderiza mensaje combinado cuando ambos flags están prendidos", async () => {
    mockGetCurrentUser.mockResolvedValue({
      githubUsername: "juangarcia",
      isAdmin: false,
    });
    mockGetAlumnoByGithub.mockResolvedValue(
      makeAlumno({
        gruposSyncFallidoEn: new Date("2026-04-01"),
        alumnoSyncFallidoEn: new Date("2026-04-01"),
      })
    );

    const banner = await SyncPendingBanner();
    const html = renderToStaticMarkup(banner as React.ReactElement);

    expect(html).toContain("tus datos");
    expect(html).toContain("grupo de TP");
  });
});
