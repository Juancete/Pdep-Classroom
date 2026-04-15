import { config } from "dotenv";

// El CLI de MikroORM no carga .env.local automáticamente (eso lo hace Next.js).
// En la app, Next.js inyecta las vars antes de ejecutar cualquier módulo.
// Para el CLI (migraciones, debug, etc.) las cargamos explícitamente acá.
if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
}

import { defineConfig, ReflectMetadataProvider } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import {
  Alumno,
  Comision,
  Assignment,
  IndividualAssignment,
  GrupalAssignment,
  Grupo,
  Entrega,
} from "./src/domain/entities";

export default defineConfig({
  // Conexión
  clientUrl: process.env.DATABASE_URL ?? "postgresql://localhost:5432/pdep_classroom",
  driverOptions: {
    connection: { ssl: process.env.DATABASE_URL?.includes("neon.tech") ? { rejectUnauthorized: false } : false },
  },

  // Entidades
  entities: [Alumno, Comision, Assignment, IndividualAssignment, GrupalAssignment, Grupo, Entrega],

  // Usa reflect-metadata en runtime (funciona en webpack/RSC sin necesitar
  // leer archivos .ts desde el filesystem).
  metadataProvider: ReflectMetadataProvider,

  // Migraciones
  extensions: [Migrator],
  migrations: {
    path: "./migrations",
    glob: "!(*.d).{js,ts}",
  },

  // Debugging (solo en dev)
  debug: process.env.NODE_ENV === "development",
});
