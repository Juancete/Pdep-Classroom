import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alumno, Comision, SuscripcionAlumno, NOMBRES_DE_CANAL } from "@/domain/entities";

const em = vi.hoisted(() => ({
  find: vi.fn(), findOne: vi.fn(), persist: vi.fn(), flush: vi.fn(),
}));
vi.mock("@/infrastructure/db", () => ({ getEM: async () => em }));

import { createAlumno, upsertAlumno, upsertAlumnos } from "./AlumnoRepository";

const comision = new Comision(2026, "sheet");
const datos = {
  legajo: "12345", nombre: "Ana", apellido: "García",
  githubUsername: "ana", email: "ana@example.com", comision,
};

function alumnoConSuscripcion(githubUsername = "ana", legajo = "12345") {
  const alumno = new Alumno();
  alumno.actualizarDatos({ ...datos, githubUsername, legajo }, []);
  const suscripcion = Object.assign(new SuscripcionAlumno(), {
    alumno, canal: "google_groups" as const, estado: "sincronizada" as const,
    destinatarioSincronizado: alumno.email,
  });
  return { alumno, suscripcion };
}

describe("persistencia de Alumno y suscripciones", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    em.find.mockResolvedValue([]);
    em.findOne.mockResolvedValue(null);
    em.flush.mockResolvedValue(undefined);
  });

  it("el alta persiste suscripciones pendientes para todos los canales declarados", async () => {
    const alumno = await createAlumno(datos);
    const persistidas = em.persist.mock.calls.map(([entidad]) => entidad);
    const suscripciones = persistidas.filter((entidad) => entidad instanceof SuscripcionAlumno);
    expect(persistidas).toContain(alumno);
    expect(suscripciones.map((suscripcion) => suscripcion.canal)).toEqual([...NOMBRES_DE_CANAL]);
    expect(suscripciones.every((suscripcion) => suscripcion.alumno === alumno && suscripcion.estaPendiente())).toBe(true);
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["nueva@example.com", "pendiente"],
    [" ANA@Example.COM ", "sincronizada"],
  ])("el upsert con email %s persiste el estado %s", async (email, estado) => {
    const { alumno, suscripcion } = alumnoConSuscripcion();
    em.findOne.mockResolvedValue(alumno);
    em.find.mockResolvedValue([suscripcion]);
    em.flush.mockImplementation(async () => {
      expect(suscripcion.estado).toBe(estado);
    });

    expect(await upsertAlumno({ ...datos, email })).toBe(alumno);
    expect(em.find).toHaveBeenCalledTimes(1);
    expect(em.find).toHaveBeenCalledWith(SuscripcionAlumno, { alumno });
    expect(suscripcion.destinatarioSincronizado).toBe("ana@example.com");
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it("carga suscripciones en lote y aplica cambios sucesivos del mismo alumno antes del flush", async () => {
    const ana = alumnoConSuscripcion();
    const otra = alumnoConSuscripcion("bea", "54321");
    em.find
      .mockResolvedValueOnce([ana.alumno, otra.alumno])
      .mockResolvedValueOnce([ana.alumno, otra.alumno])
      .mockResolvedValueOnce([ana.suscripcion, otra.suscripcion]);
    em.flush.mockImplementation(async () => {
      expect(ana.suscripcion.estado).toBe("pendiente");
      expect(otra.suscripcion.estado).toBe("sincronizada");
      expect(ana.alumno.email).toBe(datos.email);
    });

    expect(await upsertAlumnos([
      { ...datos, email: "nuevo@example.com" },
      datos,
      { ...datos, githubUsername: "bea", legajo: "54321" },
    ])).toBe(3);

    expect(em.find.mock.calls.filter(([entidad]) => entidad === SuscripcionAlumno)).toEqual([
      [SuscripcionAlumno, { alumno: { $in: [ana.alumno.id, otra.alumno.id] } }],
    ]);
    expect(em.persist).not.toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it("reutiliza alumnos nuevos repetidos y crea una sola suscripción por canal", async () => {
    expect(await upsertAlumnos([datos, { ...datos, email: "final@example.com" }])).toBe(2);
    const persistidas = em.persist.mock.calls.map(([entidad]) => entidad);
    const alumnos = persistidas.filter((entidad) => entidad instanceof Alumno);
    const suscripciones = persistidas.filter((entidad) => entidad instanceof SuscripcionAlumno);
    expect(alumnos).toHaveLength(1);
    expect(alumnos[0].email).toBe("final@example.com");
    expect(suscripciones).toHaveLength(NOMBRES_DE_CANAL.length);
    expect(suscripciones.every((suscripcion) => suscripcion.alumno === alumnos[0] && suscripcion.estaPendiente())).toBe(true);
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it("combina existentes y nuevos repetidos sin invalidaciones cruzadas ni duplicaciones", async () => {
    const ana = alumnoConSuscripcion();
    const bea = alumnoConSuscripcion("bea", "54321");
    const nueva = { ...datos, githubUsername: "carla", legajo: "67890" };
    em.find
      .mockResolvedValueOnce([ana.alumno, bea.alumno])
      .mockResolvedValueOnce([ana.alumno, bea.alumno])
      .mockResolvedValueOnce([ana.suscripcion, bea.suscripcion])
      .mockResolvedValueOnce([]);

    expect(await upsertAlumnos([
      { ...datos, email: "nuevo@example.com" },
      { ...datos, githubUsername: "bea", legajo: "54321" },
      nueva, { ...nueva, email: "final@example.com" },
    ])).toBe(4);

    expect(ana.alumno.email).toBe("nuevo@example.com");
    expect(ana.suscripcion.estado).toBe("pendiente");
    expect(bea.alumno.email).toBe(datos.email);
    expect(bea.suscripcion.estado).toBe("sincronizada");
    const persistidas = em.persist.mock.calls.map(([entidad]) => entidad);
    const altas = persistidas.filter((entidad) => entidad instanceof Alumno);
    const suscripciones = persistidas.filter((entidad) => entidad instanceof SuscripcionAlumno);
    expect(altas).toHaveLength(1);
    expect(altas[0].email).toBe("final@example.com");
    expect(suscripciones.map((suscripcion) => suscripcion.canal)).toEqual([...NOMBRES_DE_CANAL]);
    expect(suscripciones.every((suscripcion) => suscripcion.alumno === altas[0] && suscripcion.estaPendiente())).toBe(true);
    expect(em.find.mock.calls.filter(([entidad]) => entidad === SuscripcionAlumno)).toEqual([
      [SuscripcionAlumno, { alumno: { $in: [ana.alumno.id, bea.alumno.id] } }],
      [SuscripcionAlumno, { alumno: { $in: [altas[0].id] } }],
    ]);
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it.each(["individual", "masivo"])("aborta el upsert %s si falla cargar suscripciones", async (modo) => {
    const { alumno, suscripcion } = alumnoConSuscripcion();
    const antes = { ...alumno };
    const suscripcionAntes = { ...suscripcion };
    const error = new Error("No se pudieron cargar suscripciones");
    em.findOne.mockResolvedValue(alumno);
    if (modo === "masivo") {
      em.find.mockResolvedValueOnce([alumno]).mockResolvedValueOnce([alumno]);
    }
    em.find.mockRejectedValueOnce(error);
    const cambio = { ...datos, email: "nuevo@example.com" };
    const resultado = modo === "individual" ? upsertAlumno(cambio) : upsertAlumnos([
      { ...datos, githubUsername: "nueva", legajo: "67890" }, cambio,
    ]);

    await expect(resultado).rejects.toBe(error);
    expect({ ...alumno }).toEqual(antes);
    expect({ ...suscripcion }).toEqual(suscripcionAntes);
    expect(em.persist).not.toHaveBeenCalled();
    expect(em.flush).not.toHaveBeenCalled();
  });
});
