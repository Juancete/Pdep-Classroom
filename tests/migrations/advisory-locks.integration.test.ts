import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import ormConfig from "../../mikro-orm.config";

const ormHolder = vi.hoisted(() => ({ orm: undefined as MikroORM | undefined }));

vi.mock("@/infrastructure/db", () => ({
  getEM: async () => {
    if (!ormHolder.orm) throw new Error("ORM de integración no inicializado");
    return ormHolder.orm.em.fork();
  },
}));

import { Entrega } from "../../src/domain/entities";
import {
  actualizarColaboradoresDeEntrega,
  conLockDeEntrega,
} from "../../src/infrastructure/repositories/EntregaRepository";
import { conLockBorradoReposAssignment } from "../../src/infrastructure/repositories/RepoDeletionAttemptRepository";

// Espera máxima de cada paso de sincronización. El timeout de Vitest corta el
// test pero NO cancela las promesas pendientes: cada espera lleva su propia
// cota y el `finally` de cada test libera todo lo que haya quedado abierto.
const LIMITE_MS = 10_000;
const TIMEOUT_TEST_MS = 30_000;
const INTERVALO_POLL_MS = 25;

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

// ── Sincronización y observación del lock ────────────────────

type Diferido<T = void> = {
  promesa: Promise<T>;
  resolver: (valor: T) => void;
};

function diferido<T = void>(): Diferido<T> {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver };
}

function pausa(milisegundos: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milisegundos));
}

// Un único poll acotado sobre una condición (compuesta, si hace falta). No
// deja nada vivo cuando termina: por eso no se usa `Promise.race` entre dos
// esperas, ya que el perdedor seguiría consultando Postgres.
async function esperarHasta(
  condicion: () => Promise<boolean> | boolean,
  limiteMs: number,
  mensaje: string
): Promise<void> {
  const limite = Date.now() + limiteMs;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await pausa(INTERVALO_POLL_MS);
  }
  throw new Error(`Se agotó la espera (${limiteMs} ms): ${mensaje}`);
}

// Espera acotada de una promesa concreta (un diferido, una operación). El
// temporizador se cancela al terminar para no dejar handles colgados.
async function conLimite<T>(
  promesa: Promise<T>,
  limiteMs: number,
  mensaje: string
): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencimiento = new Promise<never>((_, reject) => {
    temporizador = setTimeout(
      () => reject(new Error(`Se agotó la espera (${limiteMs} ms): ${mensaje}`)),
      limiteMs
    );
  });
  try {
    return await Promise.race([promesa, vencimiento]);
  } finally {
    clearTimeout(temporizador);
  }
}

type Seguimiento<T> = {
  estado: () => "pendiente" | "cumplida" | "rechazada";
  promesa: Promise<T>;
};

// Registra el desenlace sin consumirlo: el resultado o el error quedan
// disponibles en `promesa` para asertarlos después, así que un rechazo
// inesperado no se confunde con un desenlace válido.
function seguir<T>(promesa: Promise<T>): Seguimiento<T> {
  let estado: "pendiente" | "cumplida" | "rechazada" = "pendiente";
  const observada = promesa.then(
    (valor) => {
      estado = "cumplida";
      return valor;
    },
    (error: unknown) => {
      estado = "rechazada";
      throw error;
    }
  );
  // Evita un unhandledRejection mientras el test todavía no la esperó.
  observada.catch(() => undefined);
  return { estado: () => estado, promesa: observada };
}

// Observa el lock desde OTRA sesión: si consigue tomarlo, nadie lo sostenía.
// Tiene que ser otra sesión — los advisory locks son reentrantes dentro de la
// misma — y `fork()` toma otra conexión del pool mientras la operación
// observada sigue ocupando la suya.
async function lockTomado(orm: MikroORM, clave: string): Promise<boolean> {
  return orm.em.fork().transactional(async (observador) => {
    const filas = await observador.execute<{ libre: boolean }[]>(
      "select pg_try_advisory_xact_lock(hashtextextended(?, 0)) as libre",
      [clave]
    );
    return !filas[0]!.libre;
  });
}

// Sesiones bloqueadas esperando ESTA clave (no cualquier advisory lock). Un
// advisory lock de clave bigint aparece en `pg_locks` con `objsubid = 1` y la
// clave partida en (classid, objid): mitad alta y mitad baja.
async function pidsEsperando(orm: MikroORM, clave: string): Promise<number[]> {
  const filas = await orm.em.getConnection().execute<{ pid: number }[]>(
    `with clave as (select hashtextextended(?, 0) as valor)
     select pid from pg_locks, clave
      where locktype = 'advisory'
        and not granted
        and objsubid = 1
        and classid::bigint = ((clave.valor >> 32) & 4294967295)
        and objid::bigint = (clave.valor & 4294967295)`,
    [clave]
  );
  return filas.map((fila) => fila.pid);
}

// ── Seeds ────────────────────────────────────────────────────

async function seedEntregaActiva(
  orm: MikroORM,
  githubUsernames: string[]
): Promise<{ entregaId: string }> {
  const connection = orm.em.getConnection();
  const comisionId = randomUUID();
  const assignmentId = randomUUID();
  const grupoId = randomUUID();
  const entregaId = randomUUID();
  const repoName = `tp-${assignmentId}-grupo`;

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
       now(), ?, 5, false, 'publicado')`,
    [assignmentId, `tp-${assignmentId}`, comisionId]
  );
  await connection.execute(
    `insert into "grupo"
      ("id", "nombre", "nombre_normalizado", "paradigma",
       "max_integrantes", "creado_por", "assignment_id")
     values (?, 'Grupo lock', 'grupo-lock', 'funcional', 5, 'test', ?)`,
    [grupoId, assignmentId]
  );
  await connection.execute(
    `insert into "entrega"
      ("id", "assignment_id", "grupo_id", "github_usernames", "repo_name", "repo_url",
       "repo_deleted", "provision_estado", "created_at")
     values (?, ?, ?, ?::text[], ?, ?, false, 'activa', now())`,
    [
      entregaId,
      assignmentId,
      grupoId,
      `{${githubUsernames.join(",")}}`,
      repoName,
      `https://github.com/org/${repoName}`,
    ]
  );
  return { entregaId };
}

async function usernamesEnBase(orm: MikroORM, entregaId: string): Promise<string[]> {
  const filas = await orm.em
    .getConnection()
    .execute<{ github_usernames: string[] }[]>(
      `select "github_usernames" from "entrega" where "id" = ?`,
      [entregaId]
    );
  return [...filas[0]!.github_usernames].sort();
}

// ── Tests ────────────────────────────────────────────────────

describe.sequential("advisory locks de conLockDeEntrega y conLockBorradoReposAssignment", () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...ormConfig,
      clientUrl: getSafeTestDatabaseUrl(),
      debug: false,
      migrations: { ...ormConfig.migrations, snapshot: false },
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

  describe("conLockDeEntrega", () => {
    it(
      "sostiene el lock de la entrega mientras la operación corre y serializa a la segunda",
      async () => {
        const entregaId = randomUUID();
        const clave = `ci:${entregaId}`;
        const eventos: string[] = [];
        const primeraAdentro = diferido();
        const soltarPrimera = diferido();
        let primera: Seguimiento<void> | undefined;
        let segunda: Seguimiento<void> | undefined;

        try {
          // Sanity check del observador: con nadie adentro, el lock está libre.
          expect(await lockTomado(orm, clave)).toBe(false);

          primera = seguir(
            conLockDeEntrega(entregaId, async () => {
              eventos.push("inicio:primera");
              primeraAdentro.resolver();
              await soltarPrimera.promesa;
              eventos.push("fin:primera");
            })
          );
          await conLimite(primeraAdentro.promesa, LIMITE_MS, "la primera nunca entró al lock");

          // Con el lock roto (`getConnection().execute`) esto da `false`: el
          // advisory lock se tomó y liberó en otra conexión.
          expect(await lockTomado(orm, clave)).toBe(true);

          segunda = seguir(
            conLockDeEntrega(entregaId, async () => {
              eventos.push("inicio:segunda");
              eventos.push("fin:segunda");
            })
          );
          await esperarHasta(
            async () => (await pidsEsperando(orm, clave)).length > 0,
            LIMITE_MS,
            "la segunda no quedó esperando el lock de la entrega"
          );
          expect(eventos).toEqual(["inicio:primera"]);

          soltarPrimera.resolver();
          await conLimite(
            Promise.all([primera.promesa, segunda.promesa]),
            LIMITE_MS,
            "las operaciones no terminaron tras soltar la primera"
          );
          expect(eventos).toEqual([
            "inicio:primera",
            "fin:primera",
            "inicio:segunda",
            "fin:segunda",
          ]);
        } finally {
          soltarPrimera.resolver();
          await Promise.allSettled([primera?.promesa, segunda?.promesa]);
        }
      },
      TIMEOUT_TEST_MS
    );

    it(
      "control: dos entregas distintas no se estorban entre sí",
      async () => {
        const primeraEntregaId = randomUUID();
        const segundaEntregaId = randomUUID();
        const eventos: string[] = [];
        const primeraAdentro = diferido();
        const soltarPrimera = diferido();
        let primera: Seguimiento<void> | undefined;
        let segunda: Seguimiento<void> | undefined;

        try {
          primera = seguir(
            conLockDeEntrega(primeraEntregaId, async () => {
              eventos.push("inicio:primera");
              primeraAdentro.resolver();
              await soltarPrimera.promesa;
              eventos.push("fin:primera");
            })
          );
          await conLimite(primeraAdentro.promesa, LIMITE_MS, "la primera nunca entró al lock");

          expect(await lockTomado(orm, `ci:${segundaEntregaId}`)).toBe(false);

          // La segunda entra y termina con la primera todavía adentro.
          segunda = seguir(
            conLockDeEntrega(segundaEntregaId, async () => {
              eventos.push("inicio:segunda");
              eventos.push("fin:segunda");
            })
          );
          await conLimite(
            segunda.promesa,
            LIMITE_MS,
            "la segunda quedó bloqueada por una entrega ajena"
          );
          expect(eventos).toEqual(["inicio:primera", "inicio:segunda", "fin:segunda"]);
        } finally {
          soltarPrimera.resolver();
          await Promise.allSettled([primera?.promesa, segunda?.promesa]);
        }
      },
      TIMEOUT_TEST_MS
    );

    it(
      "libera el lock cuando la operación falla",
      async () => {
        const entregaId = randomUUID();

        await expect(
          conLockDeEntrega(entregaId, async () => {
            throw new Error("falló la operación protegida");
          })
        ).rejects.toThrow("falló la operación protegida");

        expect(await lockTomado(orm, `ci:${entregaId}`)).toBe(false);
      },
      TIMEOUT_TEST_MS
    );

    it(
      "no pierde colaboradores cuando dos eventos actualizan la misma entrega a la vez",
      async () => {
        const { entregaId } = await seedEntregaActiva(orm, ["ana"]);
        const clave = `ci:${entregaId}`;
        const primeraAdentro = diferido();
        const soltarPrimera = diferido();
        let primera: Seguimiento<void> | undefined;
        let segunda: Seguimiento<void> | undefined;

        try {
          // La primera abre la ventana de read-modify-write: carga la entrega
          // dentro de su transacción y espera. `actualizarColaboradoresDeEntrega`
          // reusa esa misma instancia del identity map, igual que el webhook
          // con su snapshot viejo.
          primera = seguir(
            conLockDeEntrega(entregaId, async (transaction) => {
              await transaction.findOneOrFail(Entrega, { id: entregaId });
              primeraAdentro.resolver();
              await soltarPrimera.promesa;
              await actualizarColaboradoresDeEntrega(entregaId, { agregar: "beto" }, transaction);
            })
          );
          await conLimite(primeraAdentro.promesa, LIMITE_MS, "la primera nunca entró al lock");

          segunda = seguir(
            conLockDeEntrega(entregaId, (transaction) =>
              actualizarColaboradoresDeEntrega(entregaId, { agregar: "caro" }, transaction)
            )
          );

          // UN solo poll sobre la condición compuesta: o la segunda ya terminó
          // (lock roto: ya pisó el array) o quedó esperando la clave (lock
          // sano). Nada queda vivo detrás y el test llega siempre a mirar el
          // dato, que es lo que falla con el bug.
          await esperarHasta(
            async () =>
              segunda!.estado() !== "pendiente" || (await pidsEsperando(orm, clave)).length > 0,
            LIMITE_MS,
            "la segunda ni terminó ni quedó esperando el lock"
          );
          // Un rechazo inesperado no es un desenlace válido: se asierta.
          expect(segunda.estado()).not.toBe("rechazada");

          soltarPrimera.resolver();
          await conLimite(
            Promise.all([primera.promesa, segunda.promesa]),
            LIMITE_MS,
            "las operaciones no terminaron tras soltar la primera"
          );

          expect(await usernamesEnBase(orm, entregaId)).toEqual(["ana", "beto", "caro"]);
        } finally {
          soltarPrimera.resolver();
          await Promise.allSettled([primera?.promesa, segunda?.promesa]);
        }
      },
      TIMEOUT_TEST_MS
    );
  });

  describe("conLockBorradoReposAssignment", () => {
    it(
      "sostiene el lock del assignment mientras la operación corre",
      async () => {
        const assignmentId = randomUUID();
        const clave = `repo-deletion:${assignmentId}`;
        const adentro = diferido();
        const soltar = diferido();
        let ejecucion: Seguimiento<void> | undefined;

        try {
          expect(await lockTomado(orm, clave)).toBe(false);

          ejecucion = seguir(
            conLockBorradoReposAssignment(assignmentId, async () => {
              adentro.resolver();
              await soltar.promesa;
            })
          );
          await conLimite(adentro.promesa, LIMITE_MS, "la operación nunca entró al lock");

          // Con el lock roto esto da `false`.
          expect(await lockTomado(orm, clave)).toBe(true);

          soltar.resolver();
          await conLimite(ejecucion.promesa, LIMITE_MS, "la operación no terminó");
          expect(await lockTomado(orm, clave)).toBe(false);
        } finally {
          soltar.resolver();
          await Promise.allSettled([ejecucion?.promesa]);
        }
      },
      TIMEOUT_TEST_MS
    );

    it(
      "control: dos assignments distintos no se estorban entre sí",
      async () => {
        const primerAssignmentId = randomUUID();
        const segundoAssignmentId = randomUUID();
        const adentro = diferido();
        const soltar = diferido();
        let primera: Seguimiento<void> | undefined;
        let segunda: Seguimiento<string> | undefined;

        try {
          primera = seguir(
            conLockBorradoReposAssignment(primerAssignmentId, async () => {
              adentro.resolver();
              await soltar.promesa;
            })
          );
          await conLimite(adentro.promesa, LIMITE_MS, "la primera nunca entró al lock");

          segunda = seguir(
            conLockBorradoReposAssignment(segundoAssignmentId, async () => "terminó")
          );
          await expect(
            conLimite(segunda.promesa, LIMITE_MS, "la segunda quedó bloqueada por un assignment ajeno")
          ).resolves.toBe("terminó");
        } finally {
          soltar.resolver();
          await Promise.allSettled([primera?.promesa, segunda?.promesa]);
        }
      },
      TIMEOUT_TEST_MS
    );
  });
});
