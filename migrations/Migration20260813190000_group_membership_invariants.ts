import { Migration } from "@mikro-orm/migrations";

export class Migration20260813190000_group_membership_invariants extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from "grupo_alumnos" ga
          join "grupo" g on g."id" = ga."grupo_id"
          group by g."assignment_id", ga."alumno_id"
          having count(*) > 1
        ) then
          raise exception 'No se puede garantizar una unica inscripcion por assignment: hay alumnos en mas de un grupo del mismo assignment.';
        end if;

        if exists (
          select 1
          from "grupo" g
          join "grupo_alumnos" ga on ga."grupo_id" = g."id"
          group by g."id", g."max_integrantes"
          having count(*) > g."max_integrantes"
        ) then
          raise exception 'No se pueden garantizar los cupos: hay grupos con mas alumnos que max_integrantes.';
        end if;
      end $$;
    `);

    this.addSql(`alter table "grupo_alumnos" add column "assignment_id" uuid null;`);
    this.addSql(`
      update "grupo_alumnos" ga
      set "assignment_id" = g."assignment_id"
      from "grupo" g
      where g."id" = ga."grupo_id";
    `);
    this.addSql(`alter table "grupo_alumnos" alter column "assignment_id" set not null;`);

    this.addSql(`alter table "grupo" add constraint "grupo_id_assignment_unique" unique ("id", "assignment_id");`);
    this.addSql(`alter table "grupo_alumnos" add constraint "grupo_alumnos_grupo_assignment_foreign" foreign key ("grupo_id", "assignment_id") references "grupo" ("id", "assignment_id") on update cascade on delete cascade;`);
    this.addSql(`create unique index "grupo_alumnos_assignment_alumno_unique_idx" on "grupo_alumnos" ("assignment_id", "alumno_id");`);

    this.addSql(`
      create function "completar_assignment_grupo_alumnos"() returns trigger as $$
      begin
        select "assignment_id"
          into new."assignment_id"
          from "grupo"
         where "id" = new."grupo_id";
        return new;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger "grupo_alumnos_completar_assignment"
      before insert or update of "grupo_id" on "grupo_alumnos"
      for each row execute function "completar_assignment_grupo_alumnos"();
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop trigger if exists "grupo_alumnos_completar_assignment" on "grupo_alumnos";`);
    this.addSql(`drop function if exists "completar_assignment_grupo_alumnos"();`);
    this.addSql(`drop index if exists "grupo_alumnos_assignment_alumno_unique_idx";`);
    this.addSql(`alter table "grupo_alumnos" drop constraint if exists "grupo_alumnos_grupo_assignment_foreign";`);
    this.addSql(`alter table "grupo" drop constraint if exists "grupo_id_assignment_unique";`);
    this.addSql(`alter table "grupo_alumnos" drop column "assignment_id";`);
  }
}
