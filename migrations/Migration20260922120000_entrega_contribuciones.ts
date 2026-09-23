import { Migration } from "@mikro-orm/migrations";

export class Migration20260922120000_entrega_contribuciones extends Migration {
  override async up(): Promise<void> {
    // Nullable en ambas columnas: distingue "nunca sincronizado" (null) de
    // "se sincronizó y el repo no tiene commits" (contribuciones = '[]').
    this.addSql(`
      alter table "entrega"
        add column "contribuciones" jsonb null,
        add column "contribuciones_actualizado_en" timestamptz null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "entrega"
        drop column "contribuciones",
        drop column "contribuciones_actualizado_en";
    `);
  }
}
