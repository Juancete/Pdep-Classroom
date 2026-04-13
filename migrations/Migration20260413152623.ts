import { Migration } from '@mikro-orm/migrations';

export class Migration20260413152623 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "entrega" add column "repo_deleted" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "entrega" drop column "repo_deleted";`);
  }

}
