import { Migration } from "@mikro-orm/migrations";

// Renombra la tabla `administrador` a `docente` (issue #90): la entidad se
// renombró de `Administrador` a `Docente` para que el nombre técnico
// coincida con el nombre visible en la UI ("docentes"), y esta migración
// alinea la tabla, el índice único y la PK con ese nuevo nombre.
export class Migration20260917120000_docente extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "administrador" rename to "docente";`);
    this.addSql(
      `alter index "administrador_github_username_unique_idx" rename to "docente_github_username_unique_idx";`
    );
    this.addSql(`alter table "docente" rename constraint "administrador_pkey" to "docente_pkey";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "docente" rename constraint "docente_pkey" to "administrador_pkey";`);
    this.addSql(
      `alter index "docente_github_username_unique_idx" rename to "administrador_github_username_unique_idx";`
    );
    this.addSql(`alter table "docente" rename to "administrador";`);
  }
}
