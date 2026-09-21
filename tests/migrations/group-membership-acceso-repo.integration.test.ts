import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const ormHolder = vi.hoisted(() => ({ orm: undefined as MikroORM | undefined }));

vi.mock("@/infrastructure/db", () => ({
  getEM: async () => {
    if (!ormHolder.orm) throw new Error("ORM de integración no inicializado");
    return ormHolder.orm.em.fork();
  },
}));

// Sólo se mockea la red de GitHub; los errores reales (`github-errors`) se
// usan tal cual para simular el 404 (issue #123).
vi.mock("@/infrastructure/github", () => ({
  addCollaborators: vi.fn(),
  removeCollaborator: vi.fn(),
  getRepoInfo: vi.fn(),
  TIMEOUT_EN_TRANSACCION_MS: 5000,
  SIN_REINTENTOS: { intentos: 1, esperaInicialMs: 0, esperaMaximaMs: 0, timeoutMs: 5000 },
}));

import {
  DOCENTE,
  Alumno,
  ColaboradorNoInvitableError,
  MiembroDeGrupo,
  ParticipanteAlumno,
  type ActorDeMembresia,
} from "../../src/domain/entities";
import {
  moverAlumnoDeGrupo,
  salirDeGrupo,
  unirseAGrupo,
} from "../../src/infrastructure/repositories/GrupoRepository";
import type { AccesoAlRepositorioDeGrupo } from "../../src/infrastructure/repositories/AccesoAlRepositorio";
import { accesoAlRepositorioDeGrupo } from "../../src/application/accesoAlRepositorio";
import { addCollaborators, getRepoInfo, removeCollaborator } from "@/infrastructure/github";
import { GithubRecursoNoEncontradoError } from "@/infrastructure/github-errors";

const SIN_REINTENTOS = { intentos: 1, esperaInicialMs: 0, esperaMaximaMs: 0, timeoutMs: 5000 };
const CREADOR = "creador-del-repo";

function getSafeTestDatabaseUrl(): string {
  const value = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "MIGRATION_TEST_DATABASE_URL es obligatoria para ejecutar pruebas de migraciones"
    );
  }

  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("La base de migraciones debe usar PostgreSQL");
  }
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `La base de migraciones debe terminar en _test; se recibió ${databaseName || "una base sin nombre"}`
    );
  }

  return value;
}

async function resetPublicSchema(orm: MikroORM): Promise<void> {
  const connection = orm.em.getConnection();
  await connection.execute('drop schema if exists "public" cascade');
  await connection.execute('create schema "public"');
}

async function participanteDeAlumno(orm: MikroORM, alumnoId: string): Promise<ParticipanteAlumno> {
  const em = orm.em.fork();
  const alumno = await em.findOneOrFail(Alumno, { id: alumnoId }, { populate: ["comision"] });
  return new ParticipanteAlumno(alumno, alumno.githubUsername);
}

function actorDocente(assignmentId: string): ActorDeMembresia {
  return DOCENTE.actorSobreMembresiaAjena(assignmentId);
}

type Seed = {
  comisionId: string;
  assignmentId: string;
  alumnoIds: string[];
  githubUsernames: string[];
  grupoIds: string[];
};

async function seedGroups(
  orm: MikroORM,
  options: { alumnos: number; grupos: number; maxIntegrantes: number }
): Promise<Seed> {
  const connection = orm.em.getConnection();
  const comisionId = randomUUID();
  const assignmentId = randomUUID();
  const alumnoIds = Array.from({ length: options.alumnos }, () => randomUUID());
  const githubUsernames = alumnoIds.map((alumnoId, index) => `alumno-${index}-${alumnoId}`);
  const grupoIds = Array.from({ length: options.grupos }, () => randomUUID());

  await connection.execute(
    `insert into "comision" ("id", "anio", "spreadsheet_id", "activa", "column_config")
     values (?, 2026, ?, false, '{}'::jsonb)`,
    [comisionId, `sheet-${comisionId}`]
  );
  await connection.execute(
    `insert into "assignment"
      ("id", "titulo", "slug", "template_repo", "paradigma", "tipo",
       "created_at", "comision_id", "max_integrantes", "inscripciones_cerradas",
       "estado_nombre")
     values (?, 'TP con repo', ?, 'org/template', 'funcional', 'grupal',
       now(), ?, ?, false, 'publicado')`,
    [assignmentId, `tp-${assignmentId}`, comisionId, options.maxIntegrantes]
  );

  for (const [index, alumnoId] of alumnoIds.entries()) {
    await connection.execute(
      `insert into "alumno"
        ("id", "legajo", "nombre", "apellido", "github_username", "email", "comision_id", "registro_confirmado_en_id")
       values (?, ?, ?, 'Test', ?, ?, ?, ?)`,
      [
        alumnoId,
        `${1000 + index}`,
        `Alumno ${index}`,
        githubUsernames[index],
        `${githubUsernames[index]}@example.com`,
        comisionId,
        comisionId,
      ]
    );
  }

  for (const [index, grupoId] of grupoIds.entries()) {
    await connection.execute(
      `insert into "grupo"
        ("id", "nombre", "nombre_normalizado", "paradigma",
         "max_integrantes", "creado_por", "assignment_id")
       values (?, ?, ?, 'funcional', ?, 'test', ?)`,
      [grupoId, `Grupo ${index}`, `grupo-${index}`, options.maxIntegrantes, assignmentId]
    );
  }

  return { comisionId, assignmentId, alumnoIds, githubUsernames, grupoIds };
}

async function seedMembership(
  orm: MikroORM,
  grupoId: string,
  assignmentId: string,
  alumnoId: string,
  githubUsername: string
): Promise<void> {
  await orm.em.getConnection().execute(
    `insert into "grupo_miembro" ("id", "grupo_id", "assignment_id", "github_username", "alumno_id")
     values (?, ?, ?, ?, ?)`,
    [randomUUID(), grupoId, assignmentId, githubUsername, alumnoId]
  );
}

async function seedEntregaActiva(
  orm: MikroORM,
  params: { assignmentId: string; grupoId: string; githubUsernames: string[] }
): Promise<{ entregaId: string; repoName: string }> {
  const entregaId = randomUUID();
  const repoName = `tp-${params.assignmentId}-grupo`;
  await orm.em.getConnection().execute(
    `insert into "entrega"
      ("id", "assignment_id", "grupo_id", "github_usernames", "repo_name", "repo_url",
       "repo_deleted", "provision_estado", "created_at")
     values (?, ?, ?, ?::text[], ?, ?, false, 'activa', now())`,
    [
      entregaId,
      params.assignmentId,
      params.grupoId,
      `{${params.githubUsernames.join(",")}}`,
      repoName,
      `https://github.com/org/${repoName}`,
    ]
  );
  return { entregaId, repoName };
}

async function seedEntregaFallidaConRepoParcial(
  orm: MikroORM,
  params: { assignmentId: string; grupoId: string; githubUsernames: string[]; inicio: Date }
): Promise<{ entregaId: string; repoName: string }> {
  const entregaId = randomUUID();
  const repoName = `tp-${params.assignmentId}-grupo`;
  await orm.em.getConnection().execute(
    `insert into "entrega"
      ("id", "assignment_id", "grupo_id", "github_usernames", "repo_name", "repo_url",
       "repo_deleted", "provision_estado", "provision_creacion_iniciada_en", "created_at")
     values (?, ?, ?, ?::text[], ?, null, false, 'fallida', ?, now())`,
    [
      entregaId,
      params.assignmentId,
      params.grupoId,
      `{${params.githubUsernames.join(",")}}`,
      repoName,
      params.inicio,
    ]
  );
  return { entregaId, repoName };
}

async function filasDeMiembro(orm: MikroORM, grupoId: string, githubUsername: string) {
  return orm.em.getConnection().execute<{ id: string }[]>(
    `select "id" from "grupo_miembro" where "grupo_id" = ? and "github_username" = ?`,
    [grupoId, githubUsername]
  );
}

async function cambiosDeMembresia(orm: MikroORM, assignmentId: string, accion: string) {
  return orm.em.getConnection().execute<{ id: string }[]>(
    `select "id" from "cambio_membresia" where "assignment_id" = ? and "accion" = ?`,
    [assignmentId, accion]
  );
}

async function colaboradoresDeEntrega(orm: MikroORM, entregaId: string): Promise<string[]> {
  const filas = await orm.em
    .getConnection()
    .execute<{ github_usernames: string[] }[]>(
      `select "github_usernames" from "entrega" where "id" = ?`,
      [entregaId]
    );
  return filas[0]!.github_usernames;
}

function puertoFalso() {
  return {
    otorgarA: vi.fn<AccesoAlRepositorioDeGrupo["otorgarA"]>().mockResolvedValue(undefined),
    revocarA: vi.fn<AccesoAlRepositorioDeGrupo["revocarA"]>().mockResolvedValue(undefined),
  };
}

describe.sequential("acceso al repositorio del grupo — atomicidad con la membresía (issue #123)", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig,
      clientUrl: getSafeTestDatabaseUrl(),
      debug: false,
      migrations: {
        ...ormConfig.migrations,
        snapshot: false,
      },
    });
    await resetPublicSchema(orm);
    await orm.getMigrator().up();
    ormHolder.orm = orm;
  });

  afterAll(async () => {
    if (!orm) return;
    ormHolder.orm = undefined;
    await resetPublicSchema(orm);
    await orm.close(true);
  });

  beforeEach(async () => {
    vi.mocked(addCollaborators).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(removeCollaborator).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(getRepoInfo).mockReset();
    await orm.em.getConnection().execute('truncate table "comision" cascade');
  });

  describe("con un puerto falso: rollback real de la transacción", () => {
    it("no deja al alumno en el grupo cuando otorgar el acceso al repositorio falla", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
      const acceso = puertoFalso();
      const falla = new Error("GitHub caído");
      acceso.otorgarA.mockRejectedValue(falla);

      await expect(
        unirseAGrupo({
          acceso,
          assignmentId: seed.assignmentId,
          grupoId: seed.grupoIds[0]!,
          participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        })
      ).rejects.toBe(falla);

      expect(await filasDeMiembro(orm, seed.grupoIds[0]!, seed.githubUsernames[0]!)).toEqual([]);
      expect(await cambiosDeMembresia(orm, seed.assignmentId, "alta")).toEqual([]);
    });

    it("deja al alumno en el grupo y registra el alta cuando otorgar el acceso resuelve", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });

      await unirseAGrupo({
        acceso: puertoFalso(),
        assignmentId: seed.assignmentId,
        grupoId: seed.grupoIds[0]!,
        participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
      });

      expect(await filasDeMiembro(orm, seed.grupoIds[0]!, seed.githubUsernames[0]!)).toHaveLength(1);
      expect(await cambiosDeMembresia(orm, seed.assignmentId, "alta")).toHaveLength(1);
    });

    it("otorga el acceso cuando el alta ya está persistida en la transacción", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
      const acceso = puertoFalso();
      const miembrosVistosEnLaTransaccion: number[] = [];
      acceso.otorgarA.mockImplementation(async (contexto, transaction) => {
        miembrosVistosEnLaTransaccion.push(
          await transaction.count(MiembroDeGrupo, {
            grupo: { id: contexto.grupoId },
            githubUsername: contexto.githubUsername,
          })
        );
      });

      await unirseAGrupo({
        acceso,
        assignmentId: seed.assignmentId,
        grupoId: seed.grupoIds[0]!,
        participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
      });

      expect(miembrosVistosEnLaTransaccion).toEqual([1]);
    });

    it("deshace el movimiento entero cuando falla otorgar el acceso al grupo destino", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 2, maxIntegrantes: 3 });
      const [grupoOrigen, grupoDestino] = seed.grupoIds as [string, string];
      await seedMembership(orm, grupoOrigen, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
      const acceso = puertoFalso();
      const falla = new Error("GitHub caído");
      acceso.otorgarA.mockRejectedValue(falla);

      await expect(
        moverAlumnoDeGrupo({
          acceso,
          assignmentId: seed.assignmentId,
          grupoDestinoId: grupoDestino,
          githubUsername: seed.githubUsernames[0]!,
          actor: actorDocente(seed.assignmentId),
          realizadoPor: "docente1",
        })
      ).rejects.toBe(falla);

      expect(await filasDeMiembro(orm, grupoOrigen, seed.githubUsernames[0]!)).toHaveLength(1);
      expect(await filasDeMiembro(orm, grupoDestino, seed.githubUsernames[0]!)).toEqual([]);
      expect(await cambiosDeMembresia(orm, seed.assignmentId, "cambio")).toEqual([]);
      expect(acceso.revocarA.mock.invocationCallOrder[0]).toBeLessThan(
        acceso.otorgarA.mock.invocationCallOrder[0]!
      );
    });

    it("deshace la baja cuando falla la revocación del acceso", async () => {
      const seed = await seedGroups(orm, { alumnos: 2, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);
      const acceso = puertoFalso();
      const falla = new Error("GitHub caído");
      acceso.revocarA.mockRejectedValue(falla);

      await expect(
        salirDeGrupo({
          acceso,
          assignmentId: seed.assignmentId,
          grupoId,
          githubUsername: seed.githubUsernames[0]!,
          actor: actorDocente(seed.assignmentId),
          realizadoPor: "docente1",
        })
      ).rejects.toBe(falla);

      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toHaveLength(1);
      expect(await cambiosDeMembresia(orm, seed.assignmentId, "baja")).toEqual([]);
    });
  });

  describe("con el adapter real y GitHub mockeado: grupo cuyo repo ya estaba creado", () => {
    it("invita al integrante que se une a un grupo cuyo repo ya estaba creado y lo suma a los colaboradores", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      const { entregaId, repoName } = await seedEntregaActiva(orm, {
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsernames: [CREADOR],
      });

      await unirseAGrupo({
        acceso: accesoAlRepositorioDeGrupo,
        assignmentId: seed.assignmentId,
        grupoId,
        participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
      });

      expect(addCollaborators).toHaveBeenCalledWith(
        repoName,
        [seed.githubUsernames[0]],
        "push",
        SIN_REINTENTOS
      );
      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toHaveLength(1);
      expect(await colaboradoresDeEntrega(orm, entregaId)).toEqual([
        CREADOR,
        seed.githubUsernames[0],
      ]);
    });

    it("no deja al alumno en el grupo cuando GitHub falla al invitarlo", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      const { entregaId } = await seedEntregaActiva(orm, {
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsernames: [CREADOR],
      });
      const falla = new Error("GitHub 500");
      vi.mocked(addCollaborators).mockRejectedValue(falla);

      await expect(
        unirseAGrupo({
          acceso: accesoAlRepositorioDeGrupo,
          assignmentId: seed.assignmentId,
          grupoId,
          participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        })
      ).rejects.toBe(falla);

      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toEqual([]);
      expect(await cambiosDeMembresia(orm, seed.assignmentId, "alta")).toEqual([]);
      expect(await colaboradoresDeEntrega(orm, entregaId)).toEqual([CREADOR]);
    });

    it("traduce el 404 de GitHub a un error que el alumno puede entender y no lo deja en el grupo", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      await seedEntregaActiva(orm, {
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsernames: [CREADOR],
      });
      vi.mocked(addCollaborators).mockRejectedValue(
        new GithubRecursoNoEncontradoError("usuario inexistente")
      );

      await expect(
        unirseAGrupo({
          acceso: accesoAlRepositorioDeGrupo,
          assignmentId: seed.assignmentId,
          grupoId,
          participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
        })
      ).rejects.toBeInstanceOf(ColaboradorNoInvitableError);

      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toEqual([]);
    });

    it("no toca GitHub cuando el grupo todavía no aceptó el TP", async () => {
      const seed = await seedGroups(orm, { alumnos: 1, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;

      await unirseAGrupo({
        acceso: accesoAlRepositorioDeGrupo,
        assignmentId: seed.assignmentId,
        grupoId,
        participante: await participanteDeAlumno(orm, seed.alumnoIds[0]!),
      });

      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toHaveLength(1);
      expect(addCollaborators).not.toHaveBeenCalled();
    });

    it("no pierde colaboradores cuando dos integrantes se unen al mismo grupo con repo a la vez", async () => {
      const seed = await seedGroups(orm, { alumnos: 2, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      const { entregaId } = await seedEntregaActiva(orm, {
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsernames: [CREADOR],
      });
      const participantes = await Promise.all(
        seed.alumnoIds.map((alumnoId) => participanteDeAlumno(orm, alumnoId))
      );

      await Promise.all(
        participantes.map((participante) =>
          unirseAGrupo({
            acceso: accesoAlRepositorioDeGrupo,
            assignmentId: seed.assignmentId,
            grupoId,
            participante,
          })
        )
      );

      for (const githubUsername of seed.githubUsernames) {
        expect(await filasDeMiembro(orm, grupoId, githubUsername)).toHaveLength(1);
      }
      const colaboradores = await colaboradoresDeEntrega(orm, entregaId);
      expect([...colaboradores].sort()).toEqual([CREADOR, ...seed.githubUsernames].sort());
    });

    it("revoca el acceso y quita al integrante de los colaboradores cuando el docente lo saca de un grupo con repo", async () => {
      const seed = await seedGroups(orm, { alumnos: 2, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);
      const { entregaId, repoName } = await seedEntregaActiva(orm, {
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsernames: [CREADOR, ...seed.githubUsernames],
      });

      await salirDeGrupo({
        acceso: accesoAlRepositorioDeGrupo,
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsername: seed.githubUsernames[0]!,
        actor: actorDocente(seed.assignmentId),
        realizadoPor: "docente1",
      });

      expect(removeCollaborator).toHaveBeenCalledWith(repoName, seed.githubUsernames[0]);
      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toEqual([]);
      const colaboradores = await colaboradoresDeEntrega(orm, entregaId);
      expect(colaboradores).not.toContain(seed.githubUsernames[0]);
      expect(colaboradores).toContain(seed.githubUsernames[1]);
    });

    it("revoca el acceso del integrante que ya estaba invitado en el repositorio que una provisión fallida dejó a medias", async () => {
      const seed = await seedGroups(orm, { alumnos: 2, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);
      const inicio = new Date();
      const { entregaId, repoName } = await seedEntregaFallidaConRepoParcial(orm, {
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsernames: [CREADOR, ...seed.githubUsernames],
        inicio,
      });
      vi.mocked(getRepoInfo).mockResolvedValue({
        repoGithubId: "987654",
        repoUrl: `https://github.com/org/${repoName}`,
        description: `TP [pdep-entrega:${entregaId}]`,
        createdAt: new Date(inicio.getTime() + 1000),
      });

      await salirDeGrupo({
        acceso: accesoAlRepositorioDeGrupo,
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsername: seed.githubUsernames[0]!,
        actor: actorDocente(seed.assignmentId),
        realizadoPor: "docente1",
      });

      expect(removeCollaborator).toHaveBeenCalledWith(repoName, seed.githubUsernames[0]);
      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toEqual([]);
      expect(await colaboradoresDeEntrega(orm, entregaId)).not.toContain(seed.githubUsernames[0]);
    });

    it("no revoca en un repositorio homónimo que no es de la entrega", async () => {
      const seed = await seedGroups(orm, { alumnos: 2, grupos: 1, maxIntegrantes: 3 });
      const grupoId = seed.grupoIds[0]!;
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[0]!, seed.githubUsernames[0]!);
      await seedMembership(orm, grupoId, seed.assignmentId, seed.alumnoIds[1]!, seed.githubUsernames[1]!);
      const inicio = new Date();
      const { repoName } = await seedEntregaFallidaConRepoParcial(orm, {
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsernames: [CREADOR, ...seed.githubUsernames],
        inicio,
      });
      vi.mocked(getRepoInfo).mockResolvedValue({
        repoGithubId: "987654",
        repoUrl: `https://github.com/org/${repoName}`,
        description: "Repo de otra persona",
        createdAt: new Date(inicio.getTime() + 1000),
      });

      await salirDeGrupo({
        acceso: accesoAlRepositorioDeGrupo,
        assignmentId: seed.assignmentId,
        grupoId,
        githubUsername: seed.githubUsernames[0]!,
        actor: actorDocente(seed.assignmentId),
        realizadoPor: "docente1",
      });

      expect(removeCollaborator).not.toHaveBeenCalled();
      expect(await filasDeMiembro(orm, grupoId, seed.githubUsernames[0]!)).toEqual([]);
    });
  });
});
