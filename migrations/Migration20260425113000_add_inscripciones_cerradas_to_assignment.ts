import { Migration } from '@mikro-orm/migrations';

export class Migration20260425113000_add_inscripciones_cerradas_to_assignment extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "assignment" add column "inscripciones_cerradas" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "assignment" drop column "inscripciones_cerradas";`);
  }

}
