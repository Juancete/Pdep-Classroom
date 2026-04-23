import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Comision } from "./Comision";

@Entity()
export class Alumno {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: 'string', unique: true })
  legajo!: string;

  @Property({ type: 'string' })
  nombre!: string;

  @Property({ type: 'string' })
  apellido!: string;

  @Property({ type: 'string', unique: true })
  githubUsername!: string;

  @Property({ type: 'string' })
  email!: string;

  @ManyToOne(() => Comision, { nullable: true })
  comision?: Comision;

  // Marca la comisión en la que el alumno confirmó sus datos por última vez.
  // Si no coincide con la comisión activa, se le pide re-confirmar en /registro.
  @ManyToOne(() => Comision, { nullable: true })
  registroConfirmadoEn?: Comision;

  // Timestamp del último fallo al sincronizar los grupos del alumno desde la
  // planilla. Se prende cuando `sincronizarGruposDelAlumno` throwea y se limpia
  // cuando un reintento exitoso lo resuelve. Mientras esté prendido, el header
  // muestra un banner persistente y el perfil reintenta la sync al montar.
  @Property({ type: 'datetime', nullable: true })
  gruposSyncFallidoEn?: Date;

  get nombreCompleto(): string {
    return `${this.apellido}, ${this.nombre}`;
  }
}
