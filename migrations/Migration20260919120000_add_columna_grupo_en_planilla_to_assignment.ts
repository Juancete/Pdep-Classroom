import { Migration } from '@mikro-orm/migrations';

export class Migration20260919120000_add_columna_grupo_en_planilla_to_assignment extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "assignment" add column "columna_grupo_en_planilla" int null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "assignment" drop column "columna_grupo_en_planilla";`);
  }

}
