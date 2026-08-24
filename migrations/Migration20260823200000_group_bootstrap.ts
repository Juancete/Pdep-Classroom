import { Migration } from "@mikro-orm/migrations";

export class Migration20260823200000_group_bootstrap extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "comision" add column "grupos_importados_en" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "comision" drop column "grupos_importados_en";`);
  }
}
