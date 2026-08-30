import { Migration } from "@mikro-orm/migrations";

export class Migration20260823193000_entrega_provisioning extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "entrega" add column "provision_estado" text check ("provision_estado" in ('pendiente', 'activa', 'fallida')) not null default 'activa';`);
    this.addSql(`alter table "entrega" add column "provision_ultimo_error" text null;`);
    this.addSql(`alter table "entrega" add column "provision_intentos" int not null default 0;`);
    this.addSql(`alter table "entrega" add column "provision_creacion_iniciada_en" timestamptz null;`);
    this.addSql(`alter table "entrega" add column "provision_actualizado_en" timestamptz null;`);
    this.addSql(`create index "entrega_provision_estado_actualizado_idx" on "entrega" ("provision_estado", "provision_actualizado_en") where "provision_estado" <> 'activa';`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "entrega_provision_estado_actualizado_idx";`);
    this.addSql(`alter table "entrega" drop column "provision_actualizado_en";`);
    this.addSql(`alter table "entrega" drop column "provision_creacion_iniciada_en";`);
    this.addSql(`alter table "entrega" drop column "provision_intentos";`);
    this.addSql(`alter table "entrega" drop column "provision_ultimo_error";`);
    this.addSql(`alter table "entrega" drop column "provision_estado";`);
  }
}
