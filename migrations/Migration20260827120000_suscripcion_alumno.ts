import { Migration } from "@mikro-orm/migrations";

export class Migration20260827120000_suscripcion_alumno extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "suscripcion_alumno" (
        "id" uuid not null,
        "alumno_id" uuid not null,
        "canal" text check ("canal" in ('google_groups')) not null,
        "estado" text
          check ("estado" in ('pendiente', 'sincronizada', 'fallida', 'omitida'))
          not null default 'pendiente',
        "destinatario_sincronizado" varchar(255) null,
        "destinatarios_pendientes_baja" text[] not null default '{}',
        "ultimo_error" text null,
        "ultimo_intento_en" timestamptz null,
        "sincronizado_en" timestamptz null,
        constraint "suscripcion_alumno_pkey" primary key ("id"),
        constraint "suscripcion_alumno_alumno_canal_unique" unique ("alumno_id", "canal"),
        constraint "suscripcion_alumno_alumno_id_foreign"
          foreign key ("alumno_id") references "alumno" ("id")
          on update cascade on delete cascade
      );
    `);
    this.addSql(`
      create index "suscripcion_alumno_canal_estado_idx"
        on "suscripcion_alumno" ("canal", "estado");
    `);

    // Backfill: una fila de canal "google_groups" por alumno, con el estado
    // mapeado al nuevo vocabulario (femenino, "suscripción").
    this.addSql(`
      insert into "suscripcion_alumno" (
        "id", "alumno_id", "canal", "estado",
        "destinatario_sincronizado", "destinatarios_pendientes_baja",
        "ultimo_error", "ultimo_intento_en", "sincronizado_en"
      )
      select
        gen_random_uuid(),
        "id",
        'google_groups',
        case "google_group_estado"
          when 'sincronizado' then 'sincronizada'
          when 'fallido' then 'fallida'
          when 'omitido' then 'omitida'
          else 'pendiente'
        end,
        "google_group_email_sincronizado",
        coalesce("google_group_emails_pendientes_baja", '{}'),
        "google_group_ultimo_error",
        "google_group_ultimo_intento_en",
        "google_group_sincronizado_en"
      from "alumno";
    `);

    this.addSql(`
      alter table "alumno"
        drop column "google_group_estado",
        drop column "google_group_email_sincronizado",
        drop column "google_group_emails_pendientes_baja",
        drop column "google_group_ultimo_error",
        drop column "google_group_ultimo_intento_en",
        drop column "google_group_sincronizado_en";
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "alumno"
        add column "google_group_estado" text
          check ("google_group_estado" in ('pendiente', 'sincronizado', 'fallido', 'omitido'))
          not null default 'pendiente',
        add column "google_group_email_sincronizado" varchar(255) null,
        add column "google_group_emails_pendientes_baja" text[] not null default '{}',
        add column "google_group_ultimo_error" text null,
        add column "google_group_ultimo_intento_en" timestamptz null,
        add column "google_group_sincronizado_en" timestamptz null;
    `);

    // Restaura los valores del canal "google_groups". Las filas de cualquier
    // otro canal no tienen a dónde volver — esas columnas solo modelaban
    // Google Groups — y se pierden en el rollback. Es intencional.
    this.addSql(`
      update "alumno" as "a"
        set
          "google_group_estado" = case "s"."estado"
            when 'sincronizada' then 'sincronizado'
            when 'fallida' then 'fallido'
            when 'omitida' then 'omitido'
            else 'pendiente'
          end,
          "google_group_email_sincronizado" = "s"."destinatario_sincronizado",
          "google_group_emails_pendientes_baja" = "s"."destinatarios_pendientes_baja",
          "google_group_ultimo_error" = "s"."ultimo_error",
          "google_group_ultimo_intento_en" = "s"."ultimo_intento_en",
          "google_group_sincronizado_en" = "s"."sincronizado_en"
        from "suscripcion_alumno" as "s"
        where "s"."alumno_id" = "a"."id" and "s"."canal" = 'google_groups';
    `);

    this.addSql(`drop table if exists "suscripcion_alumno" cascade;`);
  }
}
