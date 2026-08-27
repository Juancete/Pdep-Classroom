import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alumno, SuscripcionAlumno } from "@/domain/entities";
import { CanalDePrueba } from "./__testing__/CanalDePrueba";

const mockGetAlumnoByGithub = vi.fn();
const mockActualizarSuscripcion = vi.fn();

vi.mock("@/lib/repositories", () => ({
  getAlumnoByGithub: (...args: unknown[]) => mockGetAlumnoByGithub(...args),
  actualizarSuscripcion: (...args: unknown[]) => mockActualizarSuscripcion(...args),
}));

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  return Object.assign(new Alumno(), {
    githubUsername: "juangarcia",
    email: "nuevo@utn.edu.ar",
    ...overrides,
  });
}

describe("CanalDeComunicacion.sincronizar", () => {
  let alumno: Alumno;
  let suscripcion: SuscripcionAlumno;
  let canal: CanalDePrueba;

  beforeEach(() => {
    vi.clearAllMocks();
    alumno = makeAlumno();
    suscripcion = new SuscripcionAlumno();
    mockGetAlumnoByGithub.mockResolvedValue(alumno);
    mockActualizarSuscripcion.mockImplementation(
      async (_username: string, _canal: string, actualizar: (actual: SuscripcionAlumno, alumno: Alumno) => void) => {
        actualizar(suscripcion, alumno);
        return suscripcion;
      }
    );
    canal = new CanalDePrueba();
  });

  it("marca omitida sin llamar a darDeAlta cuando el canal no está configurado", async () => {
    canal.estaConfigurado.mockReturnValue(false);

    await expect(canal.sincronizar("juangarcia")).resolves.toEqual({
      estado: "omitida",
    });

    expect(canal.darDeAlta).not.toHaveBeenCalled();
    expect(suscripcion.estado).toBe("omitida");
    expect(suscripcion.ultimoIntentoEn).toBeInstanceOf(Date);
  });

  it("marca omitida sin llamar a darDeAlta cuando el alumno no tiene destinatario en el canal", async () => {
    canal.destinatarioDe.mockReturnValue(null);

    await expect(canal.sincronizar("juangarcia")).resolves.toEqual({
      estado: "omitida",
    });

    expect(canal.darDeAlta).not.toHaveBeenCalled();
    expect(suscripcion.estado).toBe("omitida");
  });

  it("asegura el destinatario actual y persiste el éxito", async () => {
    await expect(canal.sincronizar("juangarcia")).resolves.toEqual({
      estado: "sincronizada",
    });

    expect(canal.darDeAlta).toHaveBeenCalledWith("nuevo@utn.edu.ar");
    expect(suscripcion.estado).toBe("sincronizada");
    expect(suscripcion.destinatarioSincronizado).toBe("nuevo@utn.edu.ar");
    expect(suscripcion.sincronizadoEn).toBeInstanceOf(Date);
  });

  it("marca omitida si darDeAlta devuelve omitida a mitad de flujo", async () => {
    canal.darDeAlta.mockResolvedValue({ estado: "omitida" });

    await expect(canal.sincronizar("juangarcia")).resolves.toEqual({
      estado: "omitida",
    });

    expect(canal.darDeBaja).not.toHaveBeenCalled();
    expect(suscripcion.estado).toBe("omitida");
  });

  it("marca omitida si darDeBaja devuelve omitida a mitad de flujo", async () => {
    suscripcion.destinatarioSincronizado = "viejo@gmail.com";
    canal.darDeBaja.mockResolvedValue({ estado: "omitida" });

    await expect(canal.sincronizar("juangarcia")).resolves.toEqual({
      estado: "omitida",
    });

    expect(suscripcion.estado).toBe("omitida");
  });

  it("trata ya_estaba como éxito idempotente", async () => {
    canal.darDeAlta.mockResolvedValue({ estado: "ya_estaba" });

    await expect(canal.sincronizar("juangarcia")).resolves.toEqual({
      estado: "sincronizada",
    });
    expect(suscripcion.estado).toBe("sincronizada");
  });

  it("da de alta el destinatario nuevo antes de retirar el anterior", async () => {
    suscripcion.destinatarioSincronizado = "viejo@gmail.com";

    await canal.sincronizar("juangarcia");

    expect(canal.darDeAlta.mock.invocationCallOrder[0]).toBeLessThan(
      canal.darDeBaja.mock.invocationCallOrder[0]
    );
    expect(canal.darDeBaja).toHaveBeenCalledWith("viejo@gmail.com");
    expect(suscripcion.destinatariosPendientesBaja).toEqual([]);
    expect(suscripcion.destinatarioSincronizado).toBe("nuevo@utn.edu.ar");
  });

  it("conserva la baja pendiente cuando la baja falla", async () => {
    suscripcion.destinatarioSincronizado = "viejo@gmail.com";
    canal.darDeBaja.mockResolvedValue({
      estado: "error",
      error: "No se pudo quitar viejo@gmail.com",
    });

    await expect(canal.sincronizar("juangarcia")).resolves.toMatchObject({
      estado: "error",
    });

    expect(suscripcion.estado).toBe("fallida");
    expect(suscripcion.destinatariosPendientesBaja).toEqual(["viejo@gmail.com"]);
  });

  it("un reintento drena las bajas acumuladas", async () => {
    suscripcion.estado = "fallida";
    suscripcion.destinatarioSincronizado = "nuevo@utn.edu.ar";
    suscripcion.destinatariosPendientesBaja = [
      "primero@gmail.com",
      "segundo@gmail.com",
    ];

    await canal.sincronizar("juangarcia");

    expect(canal.darDeBaja).toHaveBeenCalledTimes(2);
    expect(suscripcion.destinatariosPendientesBaja).toEqual([]);
    expect(suscripcion.estado).toBe("sincronizada");
    expect(suscripcion.ultimoError).toBeNull();
  });

  it("persiste el error de alta pasado por sanitizarError", async () => {
    canal.darDeAlta.mockResolvedValue({
      estado: "error",
      error: "Falló nuevo@utn.edu.ar por permisos",
    });
    canal.sanitizarErrorMock.mockReturnValue("Falló xxxxxx@utn.edu.ar por permisos");

    await canal.sincronizar("juangarcia");

    expect(canal.sanitizarErrorMock).toHaveBeenCalledWith(
      "Falló nuevo@utn.edu.ar por permisos"
    );
    expect(suscripcion.estado).toBe("fallida");
    expect(suscripcion.ultimoError).toBe("Falló xxxxxx@utn.edu.ar por permisos");
  });

  it("devuelve error si el alumno no existe", async () => {
    mockGetAlumnoByGithub.mockResolvedValue(null);
    await expect(canal.sincronizar("desconocido")).resolves.toEqual({
      estado: "error",
      error: "Alumno no encontrado",
    });
  });

  it("degrada errores inesperados de persistencia sin lanzar", async () => {
    mockActualizarSuscripcion.mockRejectedValue(new Error("DB caída"));

    await expect(canal.sincronizar("juangarcia")).resolves.toEqual({
      estado: "error",
      error: "DB caída",
    });
  });
});
