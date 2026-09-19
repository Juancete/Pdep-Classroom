import { Migration } from "@mikro-orm/migrations";

// Reemplaza el pivot `grupo_alumnos` por `grupo_miembro` (issue #107/#112):
// un integrante de un `Grupo` pasa a identificarse por su username de
// GitHub, con un vínculo opcional a `Alumno` — necesario para poder admitir
// más adelante a un docente sin fila en `Alumno` (un grupo de demo de Mis
// TPs). Esta migración sólo mueve el esquema y los datos existentes; el
// comportamiento observable para un alumno no cambia (Fase A).
export class Migration20260918120000_grupo_miembro extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "grupo_miembro" (
        "id" uuid not null,
        "grupo_id" uuid not null,
        "assignment_id" uuid not null,
        "github_username" varchar(255) not null,
        "alumno_id" uuid null,
        constraint "grupo_miembro_pkey" primary key ("id")
      );
    `);

    // FK compuesta (grupo_id, assignment_id) → grupo(id, assignment_id):
    // mismo criterio que tenía `grupo_alumnos_grupo_assignment_foreign`
    // (Migration20260813190000) — evita que un miembro quede apuntando a un
    // grupo de otro assignment.
    this.addSql(`
      alter table "grupo_miembro"
        add constraint "grupo_miembro_grupo_assignment_foreign"
        foreign key ("grupo_id", "assignment_id") references "grupo" ("id", "assignment_id")
        on update cascade on delete cascade;
    `);
    this.addSql(`
      alter table "grupo_miembro"
        add constraint "grupo_miembro_alumno_id_foreign"
        foreign key ("alumno_id") references "alumno" ("id")
        on update cascade on delete cascade;
    `);
    this.addSql(`
      create unique index "grupo_miembro_assignment_username_unique_idx"
        on "grupo_miembro" ("assignment_id", "github_username");
    `);

    // Backfill desde el pivot viejo: `grupo_alumnos` no tenía el username
    // (sólo `alumno_id`) — se toma de `alumno` y se guarda en minúsculas, el
    // formato canónico que usa `MiembroDeGrupo` de acá en adelante.
    this.addSql(`
      insert into "grupo_miembro" ("id", "grupo_id", "assignment_id", "github_username", "alumno_id")
      select gen_random_uuid(), "ga"."grupo_id", "ga"."assignment_id", lower("a"."github_username"), "ga"."alumno_id"
      from "grupo_alumnos" "ga"
      join "alumno" "a" on "a"."id" = "ga"."alumno_id";
    `);

    this.addSql(`
      alter table "grupo" add column "tipo_integrantes" varchar(255) not null default 'alumnos';
    `);

    // `CambioDeMembresia.alumnoId` pasa a ser opcional: un cambio de
    // membresía de un docente sin fila en `Alumno` (un grupo de demo) no
    // tiene id de alumno que auditar.
    this.addSql(`alter table "cambio_membresia" alter column "alumno_id" drop not null;`);

    this.addSql(`drop trigger if exists "grupo_alumnos_completar_assignment" on "grupo_alumnos";`);
    this.addSql(`drop function if exists "completar_assignment_grupo_alumnos"();`);
    this.addSql(`drop index if exists "grupo_alumnos_assignment_alumno_unique_idx";`);
    this.addSql(`drop table if exists "grupo_alumnos";`);
  }

  override async down(): Promise<void> {
    this.addSql(`
      create table "grupo_alumnos" (
        "grupo_id" uuid not null,
        "alumno_id" uuid not null,
        "assignment_id" uuid not null,
        constraint "grupo_alumnos_pkey" primary key ("grupo_id", "alumno_id")
      );
    `);
    this.addSql(`
      alter table "grupo_alumnos"
        add constraint "grupo_alumnos_grupo_id_foreign"
        foreign key ("grupo_id") references "grupo" ("id")
        on update cascade on delete cascade;
    `);
    this.addSql(`
      alter table "grupo_alumnos"
        add constraint "grupo_alumnos_alumno_id_foreign"
        foreign key ("alumno_id") references "alumno" ("id")
        on update cascade on delete cascade;
    `);
    this.addSql(`
      alter table "grupo_alumnos"
        add constraint "grupo_alumnos_grupo_assignment_foreign"
        foreign key ("grupo_id", "assignment_id") references "grupo" ("id", "assignment_id")
        on update cascade on delete cascade;
    `);
    this.addSql(`
      create unique index "grupo_alumnos_assignment_alumno_unique_idx"
        on "grupo_alumnos" ("assignment_id", "alumno_id");
    `);

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

    // Sólo se recuperan los miembros con un alumno vinculado — un integrante
    // sin fila en `Alumno` (un docente en un grupo de demo, issue #107/#112)
    // no tiene a dónde volver en este pivot viejo y se pierde en el
    // rollback. Es intencional: `grupo_alumnos` nunca modeló esa posibilidad.
    this.addSql(`
      insert into "grupo_alumnos" ("grupo_id", "alumno_id", "assignment_id")
      select "grupo_id", "alumno_id", "assignment_id"
      from "grupo_miembro"
      where "alumno_id" is not null;
    `);

    this.addSql(`drop table if exists "grupo_miembro" cascade;`);
    this.addSql(`alter table "grupo" drop column "tipo_integrantes";`);

    // Vuelve a exigir `alumno_id` en la auditoría — asume que no quedan
    // filas nulas (un cambio de membresía de un docente sin fila en
    // `Alumno`); si las hay, este `down` falla, que es el comportamiento
    // correcto: no hay valor razonable para completarlas.
    this.addSql(`alter table "cambio_membresia" alter column "alumno_id" set not null;`);
  }
}
