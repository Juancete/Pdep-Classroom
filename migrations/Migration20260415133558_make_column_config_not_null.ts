import { Migration } from '@mikro-orm/migrations';

export class Migration20260415133558_make_column_config_not_null extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "comision" alter column "column_config" type jsonb using ("column_config"::jsonb);`);
    this.addSql(`alter table "comision" alter column "column_config" set not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "comision" alter column "column_config" type jsonb using ("column_config"::jsonb);`);
    this.addSql(`alter table "comision" alter column "column_config" drop not null;`);
  }

}
