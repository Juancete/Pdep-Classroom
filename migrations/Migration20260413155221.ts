import { Migration } from '@mikro-orm/migrations';

export class Migration20260413155221 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "grupo" drop constraint "grupo_assignment_id_foreign";`);

    this.addSql(`alter table "entrega" drop constraint "entrega_assignment_id_foreign";`);

    this.addSql(`alter table "grupo" add constraint "grupo_assignment_id_foreign" foreign key ("assignment_id") references "assignment" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "entrega" add constraint "entrega_assignment_id_foreign" foreign key ("assignment_id") references "assignment" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "entrega" drop constraint "entrega_assignment_id_foreign";`);

    this.addSql(`alter table "grupo" drop constraint "grupo_assignment_id_foreign";`);

    this.addSql(`alter table "entrega" add constraint "entrega_assignment_id_foreign" foreign key ("assignment_id") references "assignment" ("id") on update cascade on delete no action;`);

    this.addSql(`alter table "grupo" add constraint "grupo_assignment_id_foreign" foreign key ("assignment_id") references "assignment" ("id") on update cascade on delete no action;`);
  }

}
