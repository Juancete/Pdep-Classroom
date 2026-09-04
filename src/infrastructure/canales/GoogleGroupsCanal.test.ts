import { describe, expect, it, vi } from "vitest";
import { Alumno } from "@/domain/entities";

const mockAgregarMiembroAGrupo = vi.fn();
const mockQuitarMiembroDeGrupo = vi.fn();
const mockIsGoogleGroupsConfigured = vi.fn();

vi.mock("@/infrastructure/googleGroups", () => ({
  agregarMiembroAGrupo: (...args: unknown[]) => mockAgregarMiembroAGrupo(...args),
  quitarMiembroDeGrupo: (...args: unknown[]) => mockQuitarMiembroDeGrupo(...args),
  isGoogleGroupsConfigured: () => mockIsGoogleGroupsConfigured(),
}));

import { GoogleGroupsCanal } from "./GoogleGroupsCanal";

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  return Object.assign(new Alumno(), {
    githubUsername: "juangarcia",
    email: "Nuevo@UTN.edu.ar",
    ...overrides,
  });
}

describe("GoogleGroupsCanal", () => {
  const canal = new GoogleGroupsCanal();

  it("expone su nombre y etiqueta", () => {
    expect(canal.nombre).toBe("google_groups");
    expect(canal.etiqueta).toBe("Google Groups");
  });

  it("estaConfigurado delega en isGoogleGroupsConfigured", () => {
    mockIsGoogleGroupsConfigured.mockReturnValue(true);
    expect(canal.estaConfigurado()).toBe(true);
    mockIsGoogleGroupsConfigured.mockReturnValue(false);
    expect(canal.estaConfigurado()).toBe(false);
  });

  it("asuntoPendiente describe la acción para el mensaje al alumno", () => {
    expect(canal.asuntoPendiente()).toBe("suscribirte al grupo de Google del curso");
  });

  it("destinatarioDe normaliza el email del alumno", () => {
    const alumno = makeAlumno({ email: "  Nuevo@UTN.edu.ar  " });
    expect(canal.destinatarioDe(alumno)).toBe("nuevo@utn.edu.ar");
  });

  describe("darDeAlta", () => {
    it("mapea added a alta", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({ status: "added" });
      await expect(
        canal["darDeAlta"]("nuevo@utn.edu.ar")
      ).resolves.toEqual({ estado: "alta" });
      expect(mockAgregarMiembroAGrupo).toHaveBeenCalledWith("nuevo@utn.edu.ar");
    });

    it("mapea already_member a ya_estaba", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({ status: "already_member" });
      await expect(canal["darDeAlta"]("nuevo@utn.edu.ar")).resolves.toEqual({
        estado: "ya_estaba",
      });
    });

    it("mapea skipped a omitida", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({ status: "skipped" });
      await expect(canal["darDeAlta"]("nuevo@utn.edu.ar")).resolves.toEqual({
        estado: "omitida",
      });
    });

    it("mapea error a error", async () => {
      mockAgregarMiembroAGrupo.mockResolvedValue({
        status: "error",
        error: "Sin permisos",
      });
      await expect(canal["darDeAlta"]("nuevo@utn.edu.ar")).resolves.toEqual({
        estado: "error",
        error: "Sin permisos",
      });
    });
  });

  describe("darDeBaja", () => {
    it("mapea removed a baja", async () => {
      mockQuitarMiembroDeGrupo.mockResolvedValue({ status: "removed" });
      await expect(canal["darDeBaja"]("viejo@utn.edu.ar")).resolves.toEqual({
        estado: "baja",
      });
      expect(mockQuitarMiembroDeGrupo).toHaveBeenCalledWith("viejo@utn.edu.ar");
    });

    it("mapea not_member a no_estaba", async () => {
      mockQuitarMiembroDeGrupo.mockResolvedValue({ status: "not_member" });
      await expect(canal["darDeBaja"]("viejo@utn.edu.ar")).resolves.toEqual({
        estado: "no_estaba",
      });
    });

    it("mapea skipped a omitida", async () => {
      mockQuitarMiembroDeGrupo.mockResolvedValue({ status: "skipped" });
      await expect(canal["darDeBaja"]("viejo@utn.edu.ar")).resolves.toEqual({
        estado: "omitida",
      });
    });

    it("mapea error a error", async () => {
      mockQuitarMiembroDeGrupo.mockResolvedValue({
        status: "error",
        error: "El grupo no existe",
      });
      await expect(canal["darDeBaja"]("viejo@utn.edu.ar")).resolves.toEqual({
        estado: "error",
        error: "El grupo no existe",
      });
    });
  });

  describe("sanitizarError", () => {
    it("enmascara emails embebidos", () => {
      expect(
        canal["sanitizarError"]("Falló alumno.largo@gmail.com")
      ).not.toContain("alumno.largo@gmail.com");
    });
  });
});
