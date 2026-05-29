import { Migration } from '@mikro-orm/migrations';

export class Migration20260529130107_alumno_comision_not_null_and_cascade extends Migration {

  override async up(): Promise<void> {
    // alumno.comision_id: NOT NULL + on delete cascade
    // Un alumno siempre pertenece a una comisión; borrar la comisión borra sus alumnos.
    this.addSql(`alter table "alumno" drop constraint "alumno_comision_id_foreign";`);
    this.addSql(`alter table "alumno" alter column "comision_id" set not null;`);
    this.addSql(`alter table "alumno" add constraint "alumno_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete cascade;`);

    // assignment.comision_id: on delete cascade (seguía en set null)
    // Consistencia: borrar una comisión vieja borra también sus assignments
    // (que a su vez cascade-an a grupos, entregas e inscripciones por FKs existentes).
    this.addSql(`alter table "assignment" drop constraint "assignment_comision_id_foreign";`);
    this.addSql(`alter table "assignment" add constraint "assignment_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "alumno" drop constraint "alumno_comision_id_foreign";`);
    this.addSql(`alter table "alumno" alter column "comision_id" drop not null;`);
    this.addSql(`alter table "alumno" add constraint "alumno_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "assignment" drop constraint "assignment_comision_id_foreign";`);
    this.addSql(`alter table "assignment" add constraint "assignment_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade on delete set null;`);
  }

}
