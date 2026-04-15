import {
  Collection,
  Entity,
  OneToMany,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import type { Assignment } from "./Assignment";
import { type ColumnConfig, DEFAULT_COLUMN_CONFIG } from "@/types";

@Entity()
export class Comision {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: 'integer' })
  anio!: number;

  @Property({ type: 'string' })
  spreadsheetId!: string;

  @Property({ type: 'boolean', default: false })
  activa: boolean = false;

  @Property({ type: "json" })
  columnConfig: ColumnConfig = { ...DEFAULT_COLUMN_CONFIG };

  @OneToMany("Assignment", "comision")
  assignments = new Collection<Assignment>(this);

  constructor(anio: number, spreadsheetId: string) {
    this.anio = anio;
    this.spreadsheetId = spreadsheetId;
  }
}
