import { Migration } from '@mikro-orm/migrations';

export class Migration20260424112959_add_consistency_check_fields_to_alumno extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "alumno" add column "alumno_sync_fallido_en" timestamptz null;`);
    this.addSql(`alter table "alumno" add column "ultimo_sync_check_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "alumno" drop column "ultimo_sync_check_at";`);
    this.addSql(`alter table "alumno" drop column "alumno_sync_fallido_en";`);
  }

}
