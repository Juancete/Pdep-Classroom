import { Migration } from '@mikro-orm/migrations';

export class Migration20260410013738 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "comision" ("id" uuid not null, "anio" int not null, "spreadsheet_id" varchar(255) not null, "activa" boolean not null default false, constraint "comision_pkey" primary key ("id"));`);

    this.addSql(`create table "assignment" ("id" uuid not null, "titulo" varchar(255) not null, "slug" varchar(255) not null, "descripcion" varchar(255) null, "template_repo" varchar(255) not null, "paradigma" text check ("paradigma" in ('funcional', 'logico', 'objetos')) not null, "tipo" text check ("tipo" in ('individual', 'grupal')) not null, "deadline" date null, "created_at" timestamptz not null, "comision_id" uuid not null, "max_integrantes" int null, constraint "assignment_pkey" primary key ("id"));`);
    this.addSql(`create index "assignment_tipo_index" on "assignment" ("tipo");`);

    this.addSql(`create table "grupo" ("id" uuid not null, "nombre" varchar(255) not null, "paradigma" text check ("paradigma" in ('funcional', 'logico', 'objetos')) not null, "miembros" text[] not null, "max_integrantes" int not null, "creado_por" varchar(255) not null, "comision_id" uuid not null, constraint "grupo_pkey" primary key ("id"));`);

    this.addSql(`create table "entrega" ("id" uuid not null, "assignment_id" uuid not null, "alumno" varchar(255) null, "grupo_id" uuid null, "github_usernames" text[] not null, "repo_name" varchar(255) null, "repo_url" varchar(255) null, "created_at" timestamptz not null, constraint "entrega_pkey" primary key ("id"));`);

    this.addSql(`alter table "assignment" add constraint "assignment_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade;`);

    this.addSql(`alter table "grupo" add constraint "grupo_comision_id_foreign" foreign key ("comision_id") references "comision" ("id") on update cascade;`);

    this.addSql(`alter table "entrega" add constraint "entrega_assignment_id_foreign" foreign key ("assignment_id") references "assignment" ("id") on update cascade;`);
    this.addSql(`alter table "entrega" add constraint "entrega_grupo_id_foreign" foreign key ("grupo_id") references "grupo" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "assignment" drop constraint "assignment_comision_id_foreign";`);

    this.addSql(`alter table "grupo" drop constraint "grupo_comision_id_foreign";`);

    this.addSql(`alter table "entrega" drop constraint "entrega_assignment_id_foreign";`);

    this.addSql(`alter table "entrega" drop constraint "entrega_grupo_id_foreign";`);

    this.addSql(`drop table if exists "comision" cascade;`);

    this.addSql(`drop table if exists "assignment" cascade;`);

    this.addSql(`drop table if exists "grupo" cascade;`);

    this.addSql(`drop table if exists "entrega" cascade;`);
  }

}
