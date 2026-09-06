import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";
import { Alumno, Comision, SuscripcionAlumno, NOMBRES_DE_CANAL } from "../../src/domain/entities";

const holder = vi.hoisted(() => ({ orm: undefined as MikroORM | undefined }));
vi.mock("@/infrastructure/db", () => ({
  getEM: async () => {
    if (!holder.orm) throw new Error("ORM de prueba no inicializado");
    return holder.orm.em.fork();
  },
}));

import { createAlumno, upsertAlumno, upsertAlumnos } from "../../src/infrastructure/repositories/AlumnoRepository";

function testDatabaseUrl(): string {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!value) throw new Error("MIGRATION_TEST_DATABASE_URL es obligatoria");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.pathname.slice(1).endsWith("_test")) {
    throw new Error("La base de prueba debe ser PostgreSQL y terminar en _test");
  }
  return value;
}

describe("persistencia de Alumno y suscripciones con PostgreSQL", () => {
  let orm: MikroORM;
  let comision: Comision;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig, clientUrl: testDatabaseUrl(), debug: false,
      migrations: { ...ormConfig.migrations, snapshot: false },
    });
    await orm.em.getConnection().execute('drop schema if exists "public" cascade');
    await orm.em.getConnection().execute('create schema "public"');
    await orm.getMigrator().up();
    holder.orm = orm;
    comision = new Comision(2026, "sheet-suscripciones-test");
    await orm.em.fork().persistAndFlush(comision);
  });

  afterAll(async () => {
    holder.orm = undefined;
    if (!orm) return;
    try {
      await orm.em.getConnection().execute('drop schema if exists "public" cascade');
      await orm.em.getConnection().execute('create schema "public"');
    } finally {
      await orm.close(true);
    }
  });

  function datos(legajo: string) {
    return {
      legajo, nombre: "Ana", apellido: "García", githubUsername: `alumno-${legajo}`,
      email: `${legajo}@example.com`, comision,
    };
  }

  async function preparar(legajo: string, estado: "fallida" | "sincronizada") {
    const alumno = await createAlumno(datos(legajo));
    const em = orm.em.fork();
    const suscripciones = await em.find(SuscripcionAlumno, { alumno: alumno.id });
    expect(suscripciones).toHaveLength(NOMBRES_DE_CANAL.length);
    for (const suscripcion of suscripciones) {
      suscripcion.registrarAlta(alumno.email);
      suscripcion.destinatariosPendientesBaja = ["viejo@example.com"];
      if (estado === "fallida") suscripcion.marcarFallida("Error anterior");
      else suscripcion.marcarSincronizada();
    }
    await em.flush();
    return alumno;
  }

  // Cada lectura usa un EM nuevo: no puede aprobar por mirar instancias mutadas en memoria.
  async function releer(legajo: string) {
    const em = orm.em.fork();
    const alumno = await em.findOneOrFail(Alumno, { legajo });
    const suscripciones = await em.find(SuscripcionAlumno, { alumno: alumno.id });
    expect(suscripciones.map((suscripcion) => suscripcion.canal).sort()).toEqual([...NOMBRES_DE_CANAL].sort());
    return { alumno, suscripciones };
  }

  it("persiste email e invalidación individual conservando destinatarios y bajas", async () => {
    await preparar("81001", "fallida");
    await upsertAlumno({ ...datos("81001"), email: " NUEVO@Example.COM " });

    const { alumno, suscripciones } = await releer("81001");
    expect(alumno.email).toBe("nuevo@example.com");
    for (const suscripcion of suscripciones) {
      expect(suscripcion).toMatchObject({
        estado: "pendiente", ultimoError: null,
        destinatarioSincronizado: "81001@example.com",
        destinatariosPendientesBaja: ["viejo@example.com"],
      });
    }
  });

  it("persiste un lote mixto con un alta repetida sin duplicaciones ni invalidaciones cruzadas", async () => {
    await preparar("82001", "fallida");
    await preparar("82002", "sincronizada");
    const antes = await releer("82002");
    expect(await upsertAlumnos([
      { ...datos("82001"), email: " CAMBIO@Example.COM " },
      datos("82002"), datos("82003"),
      { ...datos("82003"), email: " FINAL@Example.COM " },
    ])).toBe(4);

    const cambio = await releer("82001");
    const igual = await releer("82002");
    const nueva = await releer("82003");
    expect(cambio.alumno.email).toBe("cambio@example.com");
    for (const suscripcion of cambio.suscripciones) {
      expect(suscripcion).toMatchObject({
        estado: "pendiente", ultimoError: null,
        destinatarioSincronizado: "82001@example.com",
        destinatariosPendientesBaja: ["viejo@example.com"],
      });
    }
    expect(igual.alumno.email).toBe("82002@example.com");
    for (const suscripcion of igual.suscripciones) {
      expect(suscripcion).toMatchObject({
        estado: "sincronizada", ultimoError: null,
        destinatarioSincronizado: "82002@example.com",
        destinatariosPendientesBaja: ["viejo@example.com"],
        sincronizadoEn: antes.suscripciones.find((previa) => previa.canal === suscripcion.canal)!.sincronizadoEn,
      });
    }
    expect(nueva.alumno.email).toBe("final@example.com");
    expect(await orm.em.fork().count(Alumno, { githubUsername: datos("82003").githubUsername })).toBe(1);
    for (const suscripcion of nueva.suscripciones) {
      expect(suscripcion).toMatchObject({
        estado: "pendiente", ultimoError: null,
        destinatarioSincronizado: null, destinatariosPendientesBaja: [],
      });
    }
  });

  it("conserva el estado persistido cuando el email solo cambia de formato", async () => {
    await preparar("83001", "fallida");
    await upsertAlumno({ ...datos("83001"), email: " 83001@Example.COM " });
    const { alumno, suscripciones } = await releer("83001");
    expect(alumno.email).toBe("83001@example.com");
    for (const suscripcion of suscripciones) {
      expect(suscripcion).toMatchObject({
        estado: "fallida", ultimoError: "Error anterior",
        destinatarioSincronizado: "83001@example.com",
        destinatariosPendientesBaja: ["viejo@example.com"],
      });
    }
  });
});
