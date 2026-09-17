import "reflect-metadata";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "../../mikro-orm.config";

// Singleton global para evitar múltiples conexiones en dev (HMR de Next.js)
// En producción (serverless) cada instancia tiene su propio ORM, el pool se maneja por process.
declare global {
  // eslint-disable-next-line no-var
  var __mikro_orm__: MikroORM | undefined;
  // eslint-disable-next-line no-var
  var __mikro_orm_init__: Promise<MikroORM> | undefined;
}

// En desarrollo, cuando webpack re-evalúa este módulo por HMR, los prototipos de las
// entidades cambian. El ORM cacheado tiene los prototipos viejos → "not discovered entity".
// Reseteamos el singleton para que se re-inicialice con las clases actuales.
if (process.env.NODE_ENV !== "production" && global.__mikro_orm__) {
  void global.__mikro_orm__.close(true);
  global.__mikro_orm__ = undefined;
  global.__mikro_orm_init__ = undefined;
}

// Guard contra el bug de raíz del issue #90: si dos layers/bundles de
// webpack cargaron copias distintas de este módulo (por ejemplo porque una
// server action se importa sólo desde un client component y Next la
// compila en la layer `action-browser` en vez de `rsc` — ver el comentario
// en `src/app/admin/docentes/page.tsx`), cada copia trae sus propias
// clases de entidad. El ORM cacheado en `globalThis` sólo conoce los
// prototipos de la copia que llamó primero a `MikroORM.init`; si otra copia
// hace `persist()` con su propia clase, MikroORM revienta con un
// "not discovered entity" críptico. Este chequeo compara, apenas se pide el
// ORM ya cacheado, la clase de cada entidad de `config.entities` contra la
// que el ORM tiene registrada por nombre, y falla rápido con un mensaje que
// explica la causa real en vez del error de MikroORM.
function asegurarMismaCopiaDeEntidades(orm: MikroORM): void {
  const metadata = orm.getMetadata();
  for (const entidad of config.entities ?? []) {
    if (typeof entidad !== "function") continue;
    const claseRegistrada = metadata.find(entidad.name)?.class;
    if (claseRegistrada && claseRegistrada !== entidad) {
      throw new Error(
        "MikroORM ya fue inicializado con otra copia de las entidades: dos bundles/layers de " +
          "webpack cargaron src/infrastructure/db.ts. Causa típica: una server action importada " +
          "sólo desde client components (se compila en la layer action-browser). Importala desde " +
          "el server component y pasala por props — ver issue #90."
      );
    }
  }
}

export async function getOrm(): Promise<MikroORM> {
  if (global.__mikro_orm__) {
    asegurarMismaCopiaDeEntidades(global.__mikro_orm__);
    return global.__mikro_orm__;
  }

  // Evita que múltiples requests simultáneos en dev inicien varias conexiones
  if (!global.__mikro_orm_init__) {
    global.__mikro_orm_init__ = MikroORM.init(config)
      .then((orm) => {
        global.__mikro_orm__ = orm;
        global.__mikro_orm_init__ = undefined;
        return orm;
      })
      .catch((cause: unknown) => {
        global.__mikro_orm_init__ = undefined;
        const isConnectionError =
          cause instanceof Error &&
          (cause.message.includes("ECONNREFUSED") ||
            cause.message.includes("ENOTFOUND") ||
            (cause as NodeJS.ErrnoException).code === "ECONNREFUSED");
        if (isConnectionError || (cause instanceof AggregateError)) {
          throw new Error(
            `No se pudo conectar a la base de datos (${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@") ?? "sin URL configurada"}). Verificá que el servidor esté disponible.`,
            { cause }
          );
        }
        throw cause;
      });
  }

  return global.__mikro_orm_init__;
}

// Helper para obtener un EntityManager fresco por request (fork)
// Cada request/server action debe usar su propio EM para evitar colisiones de identidad map
export async function getEM() {
  const orm = await getOrm();
  return orm.em.fork();
}

// Helper genérico para eliminar cualquier entidad por id
export async function deleteEntity<T extends object>(
  EntityClass: abstract new (...args: never[]) => T,
  id: string
): Promise<void> {
  const entityManager = await getEM();
  const entity = await entityManager.findOne(EntityClass, { id } as never);
  if (entity) {
    entityManager.remove(entity);
    await entityManager.flush();
  }
}
