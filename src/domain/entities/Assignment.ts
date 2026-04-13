import {
  Entity,
  Enum,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Comision } from "./Comision";
import type { Paradigma, TipoAssignment } from "@/types";

// Single Table Inheritance: todos los assignments en una sola tabla,
// discriminados por la columna `tipo`
@Entity({ discriminatorColumn: "tipo", abstract: true })
export abstract class Assignment {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property()
  titulo!: string;

  @Property()
  slug!: string;

  @Property({ nullable: true })
  descripcion?: string;

  @Property()
  templateRepo!: string;

  @Enum({ items: ["funcional", "logico", "objetos"] })
  paradigma!: Paradigma;

  @Enum({ items: ["individual", "grupal"] })
  tipo!: TipoAssignment;

  @Property({ nullable: true, type: "date" })
  deadline?: Date;

  @Property()
  createdAt: Date = new Date();

  @ManyToOne(() => Comision, { nullable: true })
  comision?: Comision;
}
