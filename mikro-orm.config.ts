import { config } from "dotenv";

// El CLI de MikroORM no carga .env.local automáticamente (eso lo hace Next.js).
// En la app, Next.js inyecta las vars antes de ejecutar cualquier módulo.
// Para el CLI (migraciones, debug, etc.) las cargamos explícitamente acá.
if (!process.env.DATABASE_URL) {
  config({ path: ".env.local" });
}

import { defineConfig } from "@mikro-orm/postgresql";
import { TsMorphMetadataProvider } from "@mikro-orm/reflection";
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

  // Entidades
  entities: [Alumno, Comision, Assignment, IndividualAssignment, GrupalAssignment, Grupo, Entrega],

  // Extrae tipos en build-time via ts-morph (sin reflect-metadata)
  metadataProvider: TsMorphMetadataProvider,

  // Migraciones
  extensions: [Migrator],
  migrations: {
    path: "./migrations",
    glob: "!(*.d).{js,ts}",
  },

  // Debugging (solo en dev)
  debug: process.env.NODE_ENV === "development",
});
