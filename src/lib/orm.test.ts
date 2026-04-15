import { describe, it, expect } from "vitest";
import { MikroORM } from "@mikro-orm/postgresql";
import { TsMorphMetadataProvider } from "@mikro-orm/reflection";
import config from "../../mikro-orm.config";

// En tests corremos en Node.js puro con paths reales → TsMorphMetadataProvider funciona.
// En la app Next.js usamos ReflectMetadataProvider (no necesita leer archivos .ts).
const testConfig = { ...config, metadataProvider: TsMorphMetadataProvider };

// Verifica que el ORM puede inicializarse y descubrir todas las entidades
// sin una conexión real a la base de datos.
// Este test falla si hay un error en la definición de entidades:
// relación mal configurada, tipo incorrecto, mappedBy inválido, etc.
describe("ORM metadata", () => {
  it("inicializa el ORM y descubre todas las entidades", async () => {
    const orm = await MikroORM.init({ ...testConfig, connect: false });
    const meta = orm.getMetadata();

    const entities = [
      "Alumno",
      "Comision",
      "Assignment",
      "IndividualAssignment",
      "GrupalAssignment",
      "Grupo",
      "Entrega",
    ];

    for (const name of entities) {
      expect(meta.has(name), `entidad '${name}' no encontrada`).toBe(true);
    }

    await orm.close(true);
  });

  it("Alumno tiene relación ManyToOne a Comision", async () => {
    const orm = await MikroORM.init({ ...testConfig, connect: false });
    const meta = orm.getMetadata();

    const alumno = meta.get("Alumno");
    const prop = alumno.properties["comision"];

    expect(prop).toBeDefined();
    expect(prop.kind).toBe("m:1");
    expect(prop.type).toBe("Comision");

    await orm.close(true);
  });
});
