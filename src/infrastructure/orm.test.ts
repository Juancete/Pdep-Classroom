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
      "RepoDeletionAttempt",
    ];

    for (const name of entities) {
      expect(meta.has(name), `entidad '${name}' no encontrada`).toBe(true);
    }

    await orm.close(true);
  });

  it("modela la auditoría de borrados sin FKs destructivas", async () => {
    const orm = await MikroORM.init({ ...testConfig, connect: false });
    const audit = orm.getMetadata().get("RepoDeletionAttempt");

    expect(audit.tableName).toBe("repo_deletion_attempt");
    expect(audit.properties.status.enum).toBe(true);
    expect(audit.properties.status.items).toEqual([
      "pending",
      "deleted",
      "already_absent",
      "failed",
    ]);
    expect(audit.relations).toHaveLength(0);

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

  it("preserva el pivot de grupos administrado por migraciones", async () => {
    const orm = await MikroORM.init({ ...testConfig, connect: false });
    const meta = orm.getMetadata();
    const grupo = meta.get("Grupo");

    expect(grupo.properties.alumnos.pivotTable).toBe("grupo_alumnos");
    expect(grupo.uniques).toContainEqual(
      expect.objectContaining({
        name: "grupo_id_assignment_unique",
        properties: ["id", "assignment"],
      })
    );
    expect(grupo.uniques).toContainEqual(
      expect.objectContaining({
        name: "grupo_assignment_nombre_normalizado_unique_idx",
        properties: ["assignment", "nombreNormalizado"],
      })
    );
    expect(config.schemaGenerator?.skipTables).toContain("grupo_alumnos");

    await orm.close(true);
  });
});
