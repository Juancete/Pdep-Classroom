import { Migration } from "@mikro-orm/migrations";

export class Migration20260610120000_add_google_group_state_to_alumno extends Migration {
  override async up(): Promise<void> {
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
  }

  override async down(): Promise<void> {
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
}
