import {
  Collection,
  Entity,
  OneToMany,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import type { Assignment } from "./Assignment";

@Entity()
export class Comision {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property()
  anio!: number;

  @Property()
  spreadsheetId!: string;

  @Property({ default: false })
  activa: boolean = false;

  @OneToMany("Assignment", "comision")
  assignments = new Collection<Assignment>(this);

  constructor(anio: number, spreadsheetId: string) {
    this.anio = anio;
    this.spreadsheetId = spreadsheetId;
  }
}
