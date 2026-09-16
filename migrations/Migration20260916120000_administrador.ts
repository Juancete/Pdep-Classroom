import { Migration } from "@mikro-orm/migrations";

export class Migration20260916120000_administrador extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "administrador" (
        "id" uuid not null,
        "github_username" varchar(255) not null,
        "nombre" varchar(255) null,
        "activo" boolean not null default true,
        "creado_en" timestamptz not null,
        "creado_por" varchar(255) not null,
        "modificado_en" timestamptz not null,
        "modificado_por" varchar(255) not null,
        constraint "administrador_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      create unique index "administrador_github_username_unique_idx"
        on "administrador" ("github_username");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "administrador" cascade;`);
  }
}
