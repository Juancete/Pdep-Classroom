import { Migration } from '@mikro-orm/migrations';

export class Migration20260413110922 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "grupo" drop constraint "grupo_comision_id_foreign";`);

    this.addSql(`alter table "grupo" rename column "comision_id" to "assignment_id";`);
    this.addSql(`alter table "grupo" add constraint "grupo_assignment_id_foreign" foreign key ("assignment_id") references "assignment" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "grupo" drop constraint "grupo_assignment_id_foreign";`);

    this.addSql(`alter table "grupo" rename column "assignment_id" to "comision_id";`);
    this.addSql(`alter table "grupo" add constraint "grupo_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete no action;`);
  }

}
