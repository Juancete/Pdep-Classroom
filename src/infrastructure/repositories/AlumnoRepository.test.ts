import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alumno, Comision, SuscripcionAlumno, NOMBRES_DE_CANAL } from "@/domain/entities";

const em = vi.hoisted(() => ({
  find: vi.fn(), findOne: vi.fn(), persist: vi.fn(), flush: vi.fn(), count: vi.fn(),
}));
vi.mock("@/infrastructure/db", () => ({ getEM: async () => em }));

import {
  createAlumno,
  filtroDeBusquedaDeAlumnos,
  getAlumnosPage,
  upsertAlumno,
  upsertAlumnos,
} from "./AlumnoRepository";

const comision = new Comision(2026, "sheet");
const datos = {
  legajo: "12345", nombre: "Ana", apellido: "García",
  githubUsername: "ana", email: "ana@example.com", comision,
};

function alumnoConSuscripcion(githubUsername = "ana", legajo = "12345") {
  const alumno = new Alumno();
  alumno.actualizarDatos({ ...datos, githubUsername, legajo }, []);
  const suscripcion = Object.assign(new SuscripcionAlumno(), {
    alumno, canal: "google_groups" as const,
    estado: "sincronizada" as SuscripcionAlumno["estado"],
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

  it("el upsert con un email que cambia carga suscripciones e invalida", async () => {
    const { alumno, suscripcion } = alumnoConSuscripcion();
    em.findOne.mockResolvedValue(alumno);
    em.find.mockResolvedValue([suscripcion]);
    em.flush.mockImplementation(async () => {
      expect(suscripcion.estado).toBe("pendiente");
    });

    expect(await upsertAlumno({ ...datos, email: "nueva@example.com" })).toBe(alumno);
    expect(em.find).toHaveBeenCalledTimes(1);
    expect(em.find).toHaveBeenCalledWith(SuscripcionAlumno, { alumno: { $in: [alumno.id] } });
    expect(suscripcion.destinatarioSincronizado).toBe("ana@example.com");
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it("el upsert con un email que sólo cambia de formato no carga suscripciones ni invalida", async () => {
    const { alumno, suscripcion } = alumnoConSuscripcion();
    em.findOne.mockResolvedValue(alumno);
    em.flush.mockImplementation(async () => {
      expect(suscripcion.estado).toBe("sincronizada");
    });

    expect(await upsertAlumno({ ...datos, email: " ANA@Example.COM " })).toBe(alumno);
    expect(em.find).not.toHaveBeenCalled();
    expect(suscripcion.destinatarioSincronizado).toBe("ana@example.com");
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  // Fix de bug: antes se invalidaba por cada fila del batch cuyo email
  // difería del que tenía la instancia EN ESE MOMENTO, no del que tenía al
  // empezar. Un batch con un typo y su corrección para el mismo alumno
  // (email final == email original) terminaba igual marcando la suscripción
  // pendiente y perdiendo el ultimoError guardado.
  it("no invalida ni pierde ultimoError si dos filas del mismo alumno en el batch terminan en el email original", async () => {
    const ana = alumnoConSuscripcion();
    ana.suscripcion.estado = "fallida";
    ana.suscripcion.ultimoError = "SMTP caído";
    const otra = alumnoConSuscripcion("bea", "54321");
    em.find
      .mockResolvedValueOnce([ana.alumno, otra.alumno])
      .mockResolvedValueOnce([ana.alumno, otra.alumno])
      .mockResolvedValueOnce([ana.suscripcion]);

    expect(await upsertAlumnos([
      { ...datos, email: "typo@example.com" },
      datos,
      { ...datos, githubUsername: "bea", legajo: "54321" },
    ])).toBe(3);

    expect(ana.alumno.email).toBe(datos.email);
    expect(ana.suscripcion.estado).toBe("fallida");
    expect(ana.suscripcion.ultimoError).toBe("SMTP caído");
    expect(otra.suscripcion.estado).toBe("sincronizada");
    // "bea" nunca cambia de email en el batch: no debe consultarse su
    // suscripción (short-circuit de performance).
    expect(em.find.mock.calls.filter(([entidad]) => entidad === SuscripcionAlumno)).toEqual([
      [SuscripcionAlumno, { alumno: { $in: [ana.alumno.id] } }],
    ]);
    expect(em.persist).not.toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalledTimes(1);
  });

  it("aplica la última fila del batch para el mismo alumno e invalida una sola vez cuando el email neto cambió", async () => {
    const ana = alumnoConSuscripcion();
    const otra = alumnoConSuscripcion("bea", "54321");
    em.find
      .mockResolvedValueOnce([ana.alumno, otra.alumno])
      .mockResolvedValueOnce([ana.alumno, otra.alumno])
      .mockResolvedValueOnce([ana.suscripcion, otra.suscripcion]);
    em.flush.mockImplementation(async () => {
      expect(ana.suscripcion.estado).toBe("pendiente");
      expect(otra.suscripcion.estado).toBe("sincronizada");
      expect(ana.alumno.email).toBe("final@example.com");
    });

    expect(await upsertAlumnos([
      { ...datos, email: "intermedio@example.com" },
      { ...datos, email: "final@example.com" },
      { ...datos, githubUsername: "bea", legajo: "54321" },
    ])).toBe(3);

    expect(em.find.mock.calls.filter(([entidad]) => entidad === SuscripcionAlumno)).toEqual([
      [SuscripcionAlumno, { alumno: { $in: [ana.alumno.id] } }],
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
      // "bea" nunca cambia de email en el batch: no se consulta su suscripción.
      .mockResolvedValueOnce([ana.suscripcion])
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
      [SuscripcionAlumno, { alumno: { $in: [ana.alumno.id] } }],
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

describe("filtroDeBusquedaDeAlumnos", () => {
  it("sin búsqueda no agrega condiciones", () => {
    expect(filtroDeBusquedaDeAlumnos(undefined)).toEqual({});
  });

  it("búsqueda de sólo espacios no agrega condiciones", () => {
    expect(filtroDeBusquedaDeAlumnos("   ")).toEqual({});
  });

  it("un término arma un $or sobre los campos buscables", () => {
    expect(filtroDeBusquedaDeAlumnos("perez")).toEqual({
      $and: [
        {
          $or: [
            { apellido: { $ilike: "%perez%" } },
            { nombre: { $ilike: "%perez%" } },
            { legajo: { $ilike: "%perez%" } },
            { githubUsername: { $ilike: "%perez%" } },
            { email: { $ilike: "%perez%" } },
          ],
        },
      ],
    });
  });

  it("varios términos se combinan con $and, uno por término", () => {
    const resultado = filtroDeBusquedaDeAlumnos("  perez   juan  ");
    expect(resultado).toEqual({
      $and: [
        {
          $or: [
            { apellido: { $ilike: "%perez%" } },
            { nombre: { $ilike: "%perez%" } },
            { legajo: { $ilike: "%perez%" } },
            { githubUsername: { $ilike: "%perez%" } },
            { email: { $ilike: "%perez%" } },
          ],
        },
        {
          $or: [
            { apellido: { $ilike: "%juan%" } },
            { nombre: { $ilike: "%juan%" } },
            { legajo: { $ilike: "%juan%" } },
            { githubUsername: { $ilike: "%juan%" } },
            { email: { $ilike: "%juan%" } },
          ],
        },
      ],
    });
  });

  it("escapa %, _ y \\ del término antes de armar el patrón $ilike", () => {
    const resultado = filtroDeBusquedaDeAlumnos("100%_ok\\");
    expect(resultado).toEqual({
      $and: [
        {
          $or: [
            { apellido: { $ilike: "%100\\%\\_ok\\\\%" } },
            { nombre: { $ilike: "%100\\%\\_ok\\\\%" } },
            { legajo: { $ilike: "%100\\%\\_ok\\\\%" } },
            { githubUsername: { $ilike: "%100\\%\\_ok\\\\%" } },
            { email: { $ilike: "%100\\%\\_ok\\\\%" } },
          ],
        },
      ],
    });
  });
});

describe("getAlumnosPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("pagina con límite y offset correctos", async () => {
    em.count.mockResolvedValue(60);
    em.find.mockResolvedValue([]);

    const resultado = await getAlumnosPage({ comisionId: "c1", page: 3 });

    expect(resultado.page).toBe(3);
    expect(resultado.pageSize).toBe(25);
    expect(resultado.total).toBe(60);
    expect(resultado.totalPages).toBe(3);
    expect(em.find).toHaveBeenCalledWith(
      Alumno,
      { comision: { id: "c1" } },
      expect.objectContaining({ limit: 25, offset: 50 })
    );
  });

  it("una página que excede el total cae en la última", async () => {
    em.count.mockResolvedValue(10);
    em.find.mockResolvedValue([]);

    const resultado = await getAlumnosPage({ comisionId: "c1", page: 999 });

    expect(resultado.page).toBe(1);
    expect(resultado.totalPages).toBe(1);
    expect(em.find).toHaveBeenCalledWith(
      Alumno,
      { comision: { id: "c1" } },
      expect.objectContaining({ limit: 25, offset: 0 })
    );
  });

  it("sin búsqueda el where sólo filtra por comisión", async () => {
    em.count.mockResolvedValue(0);
    em.find.mockResolvedValue([]);

    await getAlumnosPage({ comisionId: "c1", page: 1 });

    expect(em.count).toHaveBeenCalledWith(Alumno, { comision: { id: "c1" } });
  });

  it("con búsqueda combina el filtro de comisión con el de búsqueda", async () => {
    em.count.mockResolvedValue(0);
    em.find.mockResolvedValue([]);

    await getAlumnosPage({ comisionId: "c1", page: 1, busqueda: "perez" });

    expect(em.count).toHaveBeenCalledWith(Alumno, {
      comision: { id: "c1" },
      $and: [
        {
          $or: [
            { apellido: { $ilike: "%perez%" } },
            { nombre: { $ilike: "%perez%" } },
            { legajo: { $ilike: "%perez%" } },
            { githubUsername: { $ilike: "%perez%" } },
            { email: { $ilike: "%perez%" } },
          ],
        },
      ],
    });
  });

  it("ordena por apellido, nombre e id", async () => {
    em.count.mockResolvedValue(1);
    em.find.mockResolvedValue([]);

    await getAlumnosPage({ comisionId: "c1", page: 1 });

    expect(em.find).toHaveBeenCalledWith(
      Alumno,
      { comision: { id: "c1" } },
      expect.objectContaining({
        orderBy: { apellido: "ASC", nombre: "ASC", id: "ASC" },
      })
    );
  });
});
