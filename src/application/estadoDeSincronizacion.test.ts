import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alumno, SuscripcionAlumno } from "@/domain/entities";

const mockCanalesActivos = vi.fn();
const mockGetSuscripcionesDeAlumno = vi.fn();

vi.mock("@/infrastructure/canales", () => ({
  canalesActivos: (...args: unknown[]) => mockCanalesActivos(...args),
}));

vi.mock("@/infrastructure/repositories", () => ({
  getSuscripcionesDeAlumno: (...args: unknown[]) => mockGetSuscripcionesDeAlumno(...args),
}));

import { resolverEstadoDeSincronizacion } from "./estadoDeSincronizacion";

function makeAlumno(overrides: Partial<Alumno> = {}): Alumno {
  return Object.assign(new Alumno(), {
    id: "alumno-1",
    githubUsername: "juangarcia",
    email: "juan@gmail.com",
    alumnoSyncFallidoEn: null,
    gruposSyncFallidoEn: null,
    ...overrides,
  });
}

function makeCanalFalso(nombre: string, asunto: string) {
  return { nombre, asuntoPendiente: () => asunto };
}

function makeSuscripcion(canal: string, estado: SuscripcionAlumno["estado"]): SuscripcionAlumno {
  return Object.assign(new SuscripcionAlumno(), { alumno: makeAlumno(), canal, estado });
}

describe("resolverEstadoDeSincronizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sin nada pendiente devuelve hayPendientes false y mensaje vacío", async () => {
    mockCanalesActivos.mockReturnValue([]);
    mockGetSuscripcionesDeAlumno.mockResolvedValue([]);

    const estado = await resolverEstadoDeSincronizacion(makeAlumno());

    expect(estado).toEqual({ hayPendientes: false, mensaje: "", canalesPendientes: [] });
  });

  it("compone el mensaje con un solo canal pendiente", async () => {
    const canal = makeCanalFalso("google_groups", "suscribirte al grupo de Google del curso");
    mockCanalesActivos.mockReturnValue([canal]);
    mockGetSuscripcionesDeAlumno.mockResolvedValue([
      makeSuscripcion("google_groups", "fallida"),
    ]);

    const estado = await resolverEstadoDeSincronizacion(makeAlumno());

    expect(estado.hayPendientes).toBe(true);
    expect(estado.mensaje).toBe("No pudimos suscribirte al grupo de Google del curso.");
    expect(estado.canalesPendientes).toEqual([canal]);
  });

  it("no muestra una suscripción pendiente de un canal inactivo", async () => {
    mockCanalesActivos.mockReturnValue([]);
    mockGetSuscripcionesDeAlumno.mockResolvedValue([makeSuscripcion("google_groups", "pendiente")]);
    expect(await resolverEstadoDeSincronizacion(makeAlumno())).toEqual({
      hayPendientes: false, mensaje: "", canalesPendientes: [],
    });
  });

  it("no cuenta un canal activo cuya suscripción ya está sincronizada", async () => {
    const canal = makeCanalFalso("google_groups", "suscribirte al grupo de Google del curso");
    mockCanalesActivos.mockReturnValue([canal]);
    mockGetSuscripcionesDeAlumno.mockResolvedValue([
      makeSuscripcion("google_groups", "sincronizada"),
    ]);

    const estado = await resolverEstadoDeSincronizacion(makeAlumno());

    expect(estado).toEqual({ hayPendientes: false, mensaje: "", canalesPendientes: [] });
  });

  it("combina asuntos propios del alumno con los de un canal pendiente", async () => {
    const canal = makeCanalFalso("google_groups", "suscribirte al grupo de Google del curso");
    mockCanalesActivos.mockReturnValue([canal]);
    mockGetSuscripcionesDeAlumno.mockResolvedValue([
      makeSuscripcion("google_groups", "pendiente"),
    ]);
    const alumno = makeAlumno({ alumnoSyncFallidoEn: new Date() });

    const estado = await resolverEstadoDeSincronizacion(alumno);

    expect(estado.mensaje).toBe(
      "No pudimos reflejar tus datos de alumno en la planilla ni suscribirte al grupo de Google del curso."
    );
  });

  it("un canal sin suscripción pendiente entre varios no se cuenta", async () => {
    const canalPendiente = makeCanalFalso("google_groups", "suscribirte al grupo de Google del curso");
    const canalAlDia = makeCanalFalso("otro_canal", "hacer otra cosa");
    mockCanalesActivos.mockReturnValue([canalPendiente, canalAlDia]);
    mockGetSuscripcionesDeAlumno.mockResolvedValue([
      makeSuscripcion("google_groups", "fallida"),
      makeSuscripcion("otro_canal", "sincronizada"),
    ]);

    const estado = await resolverEstadoDeSincronizacion(makeAlumno());

    expect(estado.canalesPendientes).toEqual([canalPendiente]);
  });
});
