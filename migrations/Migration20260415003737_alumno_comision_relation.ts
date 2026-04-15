import { Migration } from '@mikro-orm/migrations';

export class Migration20260415003737_alumno_comision_relation extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "alumno" drop column "comision";`);

    this.addSql(`alter table "alumno" add column "comision_id" uuid null;`);
    this.addSql(`alter table "alumno" add constraint "alumno_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "alumno" drop constraint "alumno_comision_id_foreign";`);

    this.addSql(`alter table "alumno" drop column "comision_id";`);

    this.addSql(`alter table "alumno" add column "comision" varchar(255) null;`);
  }

}
