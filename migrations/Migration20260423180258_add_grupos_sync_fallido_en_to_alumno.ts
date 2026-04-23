import { Migration } from '@mikro-orm/migrations';

export class Migration20260423180258_add_grupos_sync_fallido_en_to_alumno extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "alumno" add column "grupos_sync_fallido_en" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "alumno" drop column "grupos_sync_fallido_en";`);
  }

}
