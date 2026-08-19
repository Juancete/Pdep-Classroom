import { Migration } from "@mikro-orm/migrations";

export class Migration20260819120000_autograding extends Migration {
  override async up(): Promise<void> {
    // Las filas existentes quedan en 'sin_consultar' por el default — todavía
    // no le preguntamos a GitHub por ninguna entrega preexistente.
    this.addSql(`
      alter table "entrega"
        add column "autograding_resultado_nombre" text
          check ("autograding_resultado_nombre" in (
            'sin_consultar', 'sin_autograding', 'sin_ejecuciones', 'pendiente',
            'aprobado', 'fallido', 'cancelado', 'error_infra'
          ))
          not null default 'sin_consultar',
        add column "autograding_run_id" varchar(255) null,
        add column "autograding_run_url" varchar(255) null,
        add column "autograding_commit_sha" varchar(255) null,
        add column "autograding_ejecutado_en" timestamptz null,
        add column "autograding_actualizado_en" timestamptz null;
    `);

    this.addSql(
      `create index "entrega_autograding_resultado_idx" on "entrega" ("assignment_id", "autograding_resultado_nombre");`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "entrega_autograding_resultado_idx";`);
    this.addSql(`
      alter table "entrega"
        drop column "autograding_resultado_nombre",
        drop column "autograding_run_id",
        drop column "autograding_run_url",
        drop column "autograding_commit_sha",
        drop column "autograding_ejecutado_en",
        drop column "autograding_actualizado_en";
    `);
  }
}
