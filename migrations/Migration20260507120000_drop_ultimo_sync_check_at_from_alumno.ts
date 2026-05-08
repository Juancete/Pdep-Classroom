import { Migration } from '@mikro-orm/migrations';

export class Migration20260507120000_drop_ultimo_sync_check_at_from_alumno extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "alumno" drop column "ultimo_sync_check_at";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "alumno" add column "ultimo_sync_check_at" timestamptz null;`);
  }

}
