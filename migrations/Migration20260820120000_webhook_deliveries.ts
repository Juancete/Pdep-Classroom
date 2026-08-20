import { Migration } from "@mikro-orm/migrations";

export class Migration20260820120000_webhook_deliveries extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "github_webhook_delivery" (
        "id" uuid not null,
        "delivery_id" varchar(255) not null,
        "evento" varchar(255) not null,
        "accion" varchar(255) null,
        "repo_name" varchar(255) null,
        "entrega_id" uuid null,
        "estado_procesamiento" text
          check ("estado_procesamiento" in ('recibido', 'procesando', 'procesado', 'ignorado', 'fallido'))
          not null default 'recibido',
        "intentos" int not null default 0,
        "error" text null,
        "payload" jsonb null,
        "recibido_en" timestamptz not null,
        "reclamado_en" timestamptz null,
        "procesado_en" timestamptz null,
        constraint "github_webhook_delivery_pkey" primary key ("id"),
        constraint "github_webhook_delivery_delivery_id_unique" unique ("delivery_id")
      );
    `);
    this.addSql(
      `create index "github_webhook_delivery_estado_recibido_idx" on "github_webhook_delivery" ("estado_procesamiento", "recibido_en");`
    );

    // Actividad reciente del repo (issue #60): la escribe el webhook de
    // `push`. Las entregas existentes quedan en null — todavía no recibimos
    // ningún push para ellas.
    this.addSql(`
      alter table "entrega"
        add column "ultimo_push_en" timestamptz null,
        add column "ultimo_push_sha" varchar(255) null,
        add column "ultimo_push_por" varchar(255) null,
        add column "repo_github_id" varchar(255) null,
        add column "repo_evento_actualizado_en" timestamptz null;
    `);
    this.addSql(
      `alter table "entrega" add constraint "entrega_repo_github_id_unique" unique ("repo_github_id");`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "entrega" drop constraint if exists "entrega_repo_github_id_unique";`
    );
    this.addSql(`
      alter table "entrega"
        drop column "ultimo_push_en",
        drop column "ultimo_push_sha",
        drop column "ultimo_push_por",
        drop column "repo_github_id",
        drop column "repo_evento_actualizado_en";
    `);
    this.addSql(`drop table if exists "github_webhook_delivery";`);
  }
}
