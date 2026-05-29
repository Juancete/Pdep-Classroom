import { Migration } from '@mikro-orm/migrations';

export class Migration20260527120000_add_unique_active_comision_index extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if (select count(*) from "comision" where "activa" is true) > 1 then
          raise exception 'No se puede crear comision_unica_activa_idx: hay mas de una comision activa. Deja una sola activa y reintenta la migracion.';
        end if;
      end $$;
    `);
    this.addSql(`create unique index "comision_unica_activa_idx" on "comision" ("activa") where "activa" is true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "comision_unica_activa_idx";`);
  }

}
