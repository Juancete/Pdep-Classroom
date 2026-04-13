import { Migration } from '@mikro-orm/migrations';

export class Migration20260413113802 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "alumno" ("id" uuid not null, "legajo" varchar(255) not null, "nombre" varchar(255) not null, "apellido" varchar(255) not null, "github_username" varchar(255) not null, "email" varchar(255) not null, "comision" varchar(255) null, constraint "alumno_pkey" primary key ("id"));`);
    this.addSql(`alter table "alumno" add constraint "alumno_legajo_unique" unique ("legajo");`);
    this.addSql(`alter table "alumno" add constraint "alumno_github_username_unique" unique ("github_username");`);

    this.addSql(`create table "assignment_alumnos" ("assignment_id" uuid not null, "alumno_id" uuid not null, constraint "assignment_alumnos_pkey" primary key ("assignment_id", "alumno_id"));`);

    this.addSql(`create table "grupo_alumnos" ("grupo_id" uuid not null, "alumno_id" uuid not null, constraint "grupo_alumnos_pkey" primary key ("grupo_id", "alumno_id"));`);

    this.addSql(`alter table "assignment_alumnos" add constraint "assignment_alumnos_assignment_id_foreign" foreign key ("assignment_id") references "assignment" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "assignment_alumnos" add constraint "assignment_alumnos_alumno_id_foreign" foreign key ("alumno_id") references "alumno" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "grupo_alumnos" add constraint "grupo_alumnos_grupo_id_foreign" foreign key ("grupo_id") references "grupo" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "grupo_alumnos" add constraint "grupo_alumnos_alumno_id_foreign" foreign key ("alumno_id") references "alumno" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "grupo" drop column "miembros";`);

    this.addSql(`alter table "entrega" drop column "alumno";`);

    this.addSql(`alter table "entrega" add column "alumno_id" uuid null;`);
    this.addSql(`alter table "entrega" add constraint "entrega_alumno_id_foreign" foreign key ("alumno_id") references "alumno" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "assignment_alumnos" drop constraint "assignment_alumnos_alumno_id_foreign";`);

    this.addSql(`alter table "entrega" drop constraint "entrega_alumno_id_foreign";`);

    this.addSql(`alter table "grupo_alumnos" drop constraint "grupo_alumnos_alumno_id_foreign";`);

    this.addSql(`drop table if exists "alumno" cascade;`);

    this.addSql(`drop table if exists "assignment_alumnos" cascade;`);

    this.addSql(`drop table if exists "grupo_alumnos" cascade;`);

    this.addSql(`alter table "entrega" drop column "alumno_id";`);

    this.addSql(`alter table "entrega" add column "alumno" varchar(255) null;`);

    this.addSql(`alter table "grupo" add column "miembros" text[] not null;`);
  }

}
