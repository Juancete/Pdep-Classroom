import { Migration } from '@mikro-orm/migrations';

export class Migration20260528123000_unique_entrega_logica extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      update "entrega" e
      set "alumno_id" = a."id"
      from "alumno" a
      where e."alumno_id" is null
        and e."grupo_id" is null
        and array_length(e."github_usernames", 1) = 1
        and lower(a."github_username") = lower(e."github_usernames"[1]);
    `);

    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from "entrega"
          where "repo_name" is not null
          group by lower("repo_name")
          having count(*) > 1
        ) then
          raise exception 'No se pueden crear índices únicos de entrega: hay repo_name duplicados.';
        end if;

        if exists (
          select 1
          from "entrega"
          where "alumno_id" is not null
          group by "assignment_id", "alumno_id"
          having count(*) > 1
        ) then
          raise exception 'No se pueden crear índices únicos de entrega: hay entregas individuales duplicadas.';
        end if;

        if exists (
          select 1
          from "entrega"
          where "grupo_id" is not null
          group by "assignment_id", "grupo_id"
          having count(*) > 1
        ) then
          raise exception 'No se pueden crear índices únicos de entrega: hay entregas grupales duplicadas.';
        end if;
      end $$;
    `);

    this.addSql(`create unique index "entrega_repo_name_unique_idx" on "entrega" (lower("repo_name")) where "repo_name" is not null;`);
    this.addSql(`create unique index "entrega_assignment_alumno_unique_idx" on "entrega" ("assignment_id", "alumno_id") where "alumno_id" is not null;`);
    this.addSql(`create unique index "entrega_assignment_grupo_unique_idx" on "entrega" ("assignment_id", "grupo_id") where "grupo_id" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "entrega_assignment_grupo_unique_idx";`);
    this.addSql(`drop index if exists "entrega_assignment_alumno_unique_idx";`);
    this.addSql(`drop index if exists "entrega_repo_name_unique_idx";`);
  }

}
