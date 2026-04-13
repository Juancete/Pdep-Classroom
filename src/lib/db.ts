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

export async function getOrm(): Promise<MikroORM> {
  if (global.__mikro_orm__) {
    return global.__mikro_orm__;
  }

  // Evita que múltiples requests simultáneos en dev inicien varias conexiones
  if (!global.__mikro_orm_init__) {
    global.__mikro_orm_init__ = MikroORM.init(config).then((orm) => {
      global.__mikro_orm__ = orm;
      global.__mikro_orm_init__ = undefined;
      return orm;
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
