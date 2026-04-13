import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "crypto";

@Entity()
export class Alumno {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ unique: true })
  legajo!: string;

  @Property()
  nombre!: string;

  @Property()
  apellido!: string;

  @Property({ unique: true })
  githubUsername!: string;

  @Property()
  email!: string;

  // Nombre de la comisión tal como aparece en la planilla, ej: "miércoles noche"
  @Property({ nullable: true })
  comision?: string;

  get nombreCompleto(): string {
    return `${this.apellido}, ${this.nombre}`;
  }
}
