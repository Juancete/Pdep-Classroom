import {
  Collection,
  Entity,
  OneToMany,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import type { Assignment } from "./Assignment";
import { type ColumnConfig, type GruposColumnConfig, DEFAULT_COLUMN_CONFIG } from "@/types";
import { COMISION_ANIO_MIN, COMISION_ANIO_MAX } from "./domain-constants";

@Entity()
export class Comision {
  static readonly ANIO_MIN = COMISION_ANIO_MIN;
  static readonly ANIO_MAX = COMISION_ANIO_MAX;
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: 'integer' })
  anio!: number;

  @Property({ type: 'string' })
  spreadsheetId!: string;

  @Property({ type: 'boolean', default: false })
  activa: boolean = false;

  // Sheets es bootstrap, no autoridad continua: una vez importados, los
  // cambios de grupos se administran exclusivamente desde Classroom.
  @Property({ type: "datetime", nullable: true })
  gruposImportadosEn?: Date;

  // Lease del bootstrap de grupos. El token identifica al request que puede
  // completar o liberar la importación; la fecha permite recuperar un request
  // que murió sin ejecutar su finally.
  @Property({ type: "string", nullable: true })
  gruposImportacionToken?: string;

  @Property({ type: "datetime", nullable: true })
  gruposImportacionIniciadaEn?: Date;

  @Property({ type: "json" })
  columnConfig: ColumnConfig = { ...DEFAULT_COLUMN_CONFIG };

  @OneToMany("Assignment", "comision")
  assignments = new Collection<Assignment>(this);

  constructor(anio: number, spreadsheetId: string) {
    this.anio = anio;
    this.spreadsheetId = spreadsheetId;
  }

  gruposConfig(): GruposColumnConfig | undefined {
    return this.columnConfig?.grupos;
  }
}
