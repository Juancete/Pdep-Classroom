import { Migration } from '@mikro-orm/migrations';

export class Migration20260413134644_make_assignment_comision_nullable extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "assignment" drop constraint "assignment_comision_id_foreign";`);

    this.addSql(`alter table "assignment" alter column "comision_id" drop default;`);
    this.addSql(`alter table "assignment" alter column "comision_id" type uuid using ("comision_id"::text::uuid);`);
    this.addSql(`alter table "assignment" alter column "comision_id" drop not null;`);
    this.addSql(`alter table "assignment" add constraint "assignment_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "assignment" drop constraint "assignment_comision_id_foreign";`);

    this.addSql(`alter table "assignment" alter column "comision_id" drop default;`);
    this.addSql(`alter table "assignment" alter column "comision_id" type uuid using ("comision_id"::text::uuid);`);
    this.addSql(`alter table "assignment" alter column "comision_id" set not null;`);
    this.addSql(`alter table "assignment" add constraint "assignment_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete no action;`);
  }

}
