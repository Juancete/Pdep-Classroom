import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alumno } from "@/domain/entities";

const mockAgregarMiembroAGrupo = vi.fn();
const mockQuitarMiembroDeGrupo = vi.fn();
const mockIsGoogleGroupsConfigured = vi.fn();
const mockGetAlumnoByGithub = vi.fn();
const mockActualizarEstadoGoogleGroup = vi.fn();

vi.mock("@/lib/googleGroups", () => ({
  agregarMiembroAGrupo: (...args: unknown[]) =>
    mockAgregarMiembroAGrupo(...args),
  quitarMiembroDeGrupo: (...args: unknown[]) =>
    mockQuitarMiembroDeGrupo(...args),
  isGoogleGroupsConfigured: () => mockIsGoogleGroupsConfigured(),
}));

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
  actualizarEstadoGoogleGroup: (...args: unknown[]) =>
    mockActualizarEstadoGoogleGroup(...args),
}));

import {
  intentarSincronizarGoogleGroup,
  sanitizarErrorGoogleGroup,
} from "./intentarSincronizarGoogleGroup";

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  return Object.assign(new Alumno(), {
    githubUsername: "juangarcia",
    email: "nuevo@utn.edu.ar",
    ...overrides,
  });
}

describe("intentarSincronizarGoogleGroup", () => {
  let alumno: Alumno;

  beforeEach(() => {
    vi.clearAllMocks();
    alumno = makeAlumno();
    mockGetAlumnoByGithub.mockResolvedValue(alumno);
    mockActualizarEstadoGoogleGroup.mockImplementation(
      async (_username: string, actualizar: (actual: Alumno) => void) => {
        actualizar(alumno);
        return alumno;
      }
    );
    mockIsGoogleGroupsConfigured.mockReturnValue(true);
    mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
    mockQuitarMiembroDeGrupo.mockResolvedValue({ status: "removed" });
  });

  it("marca omitido sin llamar a Google cuando la integración está desactivada", async () => {
    mockIsGoogleGroupsConfigured.mockReturnValue(false);

    await expect(
      intentarSincronizarGoogleGroup("juangarcia")
    ).resolves.toEqual({ status: "skipped" });

    expect(mockAgregarMiembroAGrupo).not.toHaveBeenCalled();
    expect(alumno.googleGroupEstado).toBe("omitido");
    expect(alumno.googleGroupUltimoIntentoEn).toBeInstanceOf(Date);
  });

  it("asegura el email actual y persiste el éxito", async () => {
    await expect(
      intentarSincronizarGoogleGroup("juangarcia")
    ).resolves.toEqual({ status: "added" });

    expect(mockAgregarMiembroAGrupo).toHaveBeenCalledWith(
      "nuevo@utn.edu.ar"
    );
    expect(alumno.googleGroupEstado).toBe("sincronizado");
    expect(alumno.googleGroupEmailSincronizado).toBe("nuevo@utn.edu.ar");
    expect(alumno.googleGroupSincronizadoEn).toBeInstanceOf(Date);
  });

  it("trata already_member como éxito idempotente", async () => {
    mockAgregarMiembroAGrupo.mockResolvedValue({
      status: "already_member",
    });

    await expect(
      intentarSincronizarGoogleGroup("juangarcia")
    ).resolves.toEqual({ status: "already_member" });
    expect(alumno.googleGroupEstado).toBe("sincronizado");
  });

  it("agrega el email nuevo antes de retirar el anterior", async () => {
    alumno.googleGroupEmailSincronizado = "viejo@gmail.com";

    await intentarSincronizarGoogleGroup("juangarcia");

    expect(mockAgregarMiembroAGrupo.mock.invocationCallOrder[0]).toBeLessThan(
      mockQuitarMiembroDeGrupo.mock.invocationCallOrder[0]
    );
    expect(mockQuitarMiembroDeGrupo).toHaveBeenCalledWith("viejo@gmail.com");
    expect(alumno.googleGroupEmailsPendientesBaja).toEqual([]);
    expect(alumno.googleGroupEmailSincronizado).toBe("nuevo@utn.edu.ar");
  });

  it("conserva la baja pendiente cuando Google falla", async () => {
    alumno.googleGroupEmailSincronizado = "viejo@gmail.com";
    mockQuitarMiembroDeGrupo.mockResolvedValue({
      status: "error",
      error: "No se pudo quitar viejo@gmail.com",
    });

    await expect(
      intentarSincronizarGoogleGroup("juangarcia")
    ).resolves.toMatchObject({ status: "error" });

    expect(alumno.googleGroupEstado).toBe("fallido");
    expect(alumno.googleGroupEmailsPendientesBaja).toEqual([
      "viejo@gmail.com",
    ]);
    expect(alumno.googleGroupUltimoError).not.toContain("viejo@gmail.com");
  });

  it("un reintento limpia bajas acumuladas", async () => {
    alumno.googleGroupEstado = "fallido";
    alumno.googleGroupEmailSincronizado = "nuevo@utn.edu.ar";
    alumno.googleGroupEmailsPendientesBaja = [
      "primero@gmail.com",
      "segundo@gmail.com",
    ];

    await intentarSincronizarGoogleGroup("juangarcia");

    expect(mockQuitarMiembroDeGrupo).toHaveBeenCalledTimes(2);
    expect(alumno.googleGroupEmailsPendientesBaja).toEqual([]);
    expect(alumno.googleGroupEstado).toBe("sincronizado");
    expect(alumno.googleGroupUltimoError).toBeNull();
  });

  it("persiste el error de alta sanitizado", async () => {
    mockAgregarMiembroAGrupo.mockResolvedValue({
      status: "error",
      error: "Falló nuevo@utn.edu.ar por permisos",
    });

    await intentarSincronizarGoogleGroup("juangarcia");

    expect(alumno.googleGroupEstado).toBe("fallido");
    expect(alumno.googleGroupUltimoError).toContain("@utn.edu.ar");
    expect(alumno.googleGroupUltimoError).not.toContain(
      "nuevo@utn.edu.ar"
    );
  });

  it("devuelve error si el alumno no existe", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);
    await expect(
      intentarSincronizarGoogleGroup("desconocido")
    ).resolves.toEqual({
      status: "error",
      error: "Alumno no encontrado",
    });
  });

  it("degrada errores inesperados de persistencia sin lanzar", async () => {
    mockActualizarEstadoGoogleGroup.mockRejectedValue(new Error("DB caída"));

    await expect(
      intentarSincronizarGoogleGroup("juangarcia")
    ).resolves.toEqual({
      status: "error",
      error: "DB caída",
    });
  });
});

describe("sanitizarErrorGoogleGroup", () => {
  it("enmascara emails embebidos", () => {
    expect(
      sanitizarErrorGoogleGroup("Falló alumno.largo@gmail.com")
    ).not.toContain("alumno.largo@gmail.com");
  });
});
