import { Migration } from "@mikro-orm/migrations";

function normalizarNombreGrupoHistorico(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class Migration20260814160000_group_repo_name extends Migration {
  override async up(): Promise<void> {
    await this.execute(
      'alter table "grupo" add column "nombre_normalizado" varchar(255) null;'
    );

    const grupos = (await this.execute(
      'select "id", "nombre" from "grupo"'
    )) as { id: string; nombre: string }[];

    for (const grupo of grupos) {
      const nombreNormalizado = normalizarNombreGrupoHistorico(grupo.nombre);
      if (!nombreNormalizado) {
        throw new Error(
          `No se puede normalizar el nombre del grupo ${grupo.id}: no contiene letras ni números.`
        );
      }
      await this.execute(
        'update "grupo" set "nombre_normalizado" = ? where "id" = ?',
        [nombreNormalizado, grupo.id]
      );
    }

    const colisiones = (await this.execute(`
      select "assignment_id", "nombre_normalizado"
      from "grupo"
      group by "assignment_id", "nombre_normalizado"
      having count(*) > 1
    `)) as { assignment_id: string; nombre_normalizado: string }[];
    if (colisiones.length > 0) {
      throw new Error(
        "No se puede garantizar la unicidad normalizada de grupos: hay nombres que generan el mismo identificador dentro de un assignment."
      );
    }

    await this.execute(
      'alter table "grupo" alter column "nombre_normalizado" set not null;'
    );
    await this.execute(
      'alter table "grupo" drop constraint "grupo_assignment_nombre_paradigma_unique_idx";'
    );
    await this.execute(
      'alter table "grupo" add constraint "grupo_assignment_nombre_normalizado_unique_idx" unique ("assignment_id", "nombre_normalizado");'
    );
  }

  override async down(): Promise<void> {
    await this.execute(
      'alter table "grupo" drop constraint "grupo_assignment_nombre_normalizado_unique_idx";'
    );
    await this.execute(
      'alter table "grupo" add constraint "grupo_assignment_nombre_paradigma_unique_idx" unique ("assignment_id", "nombre", "paradigma");'
    );
    await this.execute('alter table "grupo" drop column "nombre_normalizado";');
  }
}
