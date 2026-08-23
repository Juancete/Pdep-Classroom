import { Migration } from "@mikro-orm/migrations";

export class Migration20260818120000_membership_audit extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "cambio_membresia" (
        "id" uuid not null,
        "assignment_id" uuid not null,
        "alumno_id" uuid not null,
        "alumno_username" varchar(255) not null,
        "grupo_origen_id" uuid null,
        "grupo_origen_nombre" varchar(255) null,
        "grupo_destino_id" uuid null,
        "grupo_destino_nombre" varchar(255) null,
        "accion" text check ("accion" in ('alta', 'baja', 'cambio')) not null,
        "origen" text check ("origen" in ('alumno', 'docente')) not null,
        "realizado_por" varchar(255) not null,
        "grupo_origen_tenia_entrega" boolean not null,
        "grupo_origen_eliminado" boolean not null,
        "motivo" text null,
        "creado_en" timestamptz not null,
        constraint "cambio_membresia_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index "cambio_membresia_assignment_creado_idx" on "cambio_membresia" ("assignment_id", "creado_en");`);
    this.addSql(`create index "cambio_membresia_alumno_creado_idx" on "cambio_membresia" ("alumno_id", "creado_en");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cambio_membresia";`);
  }
}
