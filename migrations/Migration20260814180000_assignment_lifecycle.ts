import { Migration } from "@mikro-orm/migrations";

export class Migration20260814180000_assignment_lifecycle extends Migration {
  override async up(): Promise<void> {
    // Nuevas filas nacen en 'borrador'. Los assignments que ya existían antes
    // de esta migración quedan en 'borrador' por el default y se corrigen
    // explícitamente a 'publicado' abajo: hoy son visibles para los alumnos,
    // así que dejar el default los sacaría del flujo activo.
    this.addSql(`
      alter table "assignment"
        add column "estado_nombre" text
          check ("estado_nombre" in ('borrador', 'publicado', 'archivado'))
          not null default 'borrador';
    `);

    this.addSql(`update "assignment" set "estado_nombre" = 'publicado';`);

    this.addSql(`
      alter table "assignment"
        add column "publicado_en" timestamptz null,
        add column "publicado_por" varchar(255) null,
        add column "archivado_en" timestamptz null,
        add column "archivado_por" varchar(255) null;
    `);

    // Auditoría razonable para los assignments preexistentes: no hay usuario
    // real que los haya publicado, pero sí una fecha de creación conocida.
    this.addSql(`update "assignment" set "publicado_en" = "created_at";`);

    this.addSql(
      `create index "assignment_estado_nombre_index" on "assignment" ("estado_nombre");`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "assignment_estado_nombre_index";`);
    this.addSql(`
      alter table "assignment"
        drop column "estado_nombre",
        drop column "publicado_en",
        drop column "publicado_por",
        drop column "archivado_en",
        drop column "archivado_por";
    `);
  }
}
