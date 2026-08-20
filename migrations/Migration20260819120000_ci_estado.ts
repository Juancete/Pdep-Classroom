import { Migration } from "@mikro-orm/migrations";

export class Migration20260819120000_ci_estado extends Migration {
  override async up(): Promise<void> {
    // Las filas existentes quedan en 'sin_consultar' por el default — todavía
    // no le preguntamos a GitHub por ninguna entrega preexistente.
    this.addSql(`
      alter table "entrega"
        add column "ci_resultado_nombre" text
          check ("ci_resultado_nombre" in (
            'sin_consultar', 'sin_ci', 'pendiente', 'passing', 'failing',
            'cancelado', 'error_infra'
          ))
          not null default 'sin_consultar',
        add column "ci_check_suite_ids" text[] not null default '{}',
        add column "ci_commit_sha" varchar(255) null,
        add column "ci_detalle_url" varchar(255) null,
        add column "ci_ejecutado_en" timestamptz null,
        add column "ci_actualizado_en" timestamptz null;
    `);

    this.addSql(
      `create index "entrega_ci_resultado_idx" on "entrega" ("assignment_id", "ci_resultado_nombre");`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "entrega_ci_resultado_idx";`);
    this.addSql(`
      alter table "entrega"
        drop column "ci_resultado_nombre",
        drop column "ci_check_suite_ids",
        drop column "ci_commit_sha",
        drop column "ci_detalle_url",
        drop column "ci_ejecutado_en",
        drop column "ci_actualizado_en";
    `);
  }
}
