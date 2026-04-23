import { Migration } from '@mikro-orm/migrations';

export class Migration20260417230133_add_registro_confirmado_en_to_alumno extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "alumno" add column "registro_confirmado_en_id" uuid null;`);
    this.addSql(`alter table "alumno" add constraint "alumno_registro_confirmado_en_id_foreign" foreign key ("registro_confirmado_en_id") references "comision" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "alumno" drop constraint "alumno_registro_confirmado_en_id_foreign";`);

    this.addSql(`alter table "alumno" drop column "registro_confirmado_en_id";`);
  }

}
