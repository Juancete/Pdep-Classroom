import { Migration } from '@mikro-orm/migrations';

export class Migration20260414224452_add_column_config_to_comision extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "comision" add column "column_config" jsonb null;`);
    this.addSql(`update "comision" set "column_config" = '{"sheetName":"Alumnos","headerRows":1,"legajo":0,"apellido":1,"nombre":2,"githubUsername":3,"email":4,"comision":5}'::jsonb where "column_config" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "comision" drop column "column_config";`);
  }

}
