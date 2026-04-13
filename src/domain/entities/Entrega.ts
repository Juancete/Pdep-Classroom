import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Alumno } from "./Alumno";
import { Assignment } from "./Assignment";
import { Grupo } from "./Grupo";

@Entity()
export class Entrega {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => Assignment, { deleteRule: "cascade" })
  assignment!: Assignment;

  // Individual: alumno que entrega
  @ManyToOne(() => Alumno, { nullable: true })
  alumno?: Alumno;

  // Grupal: grupo al que pertenece la entrega
  @ManyToOne(() => Grupo, { nullable: true })
  grupo?: Grupo;

  // Todos los usernames con acceso al repo (denormalizado para queries rápidas)
  @Property({ type: "array" })
  githubUsernames: string[] = [];

  @Property({ nullable: true })
  repoName?: string;

  @Property({ nullable: true })
  repoUrl?: string;

  @Property({ default: false })
  repoDeleted: boolean = false;

  @Property()
  createdAt: Date = new Date();

  hasRepo(): boolean {
    return !!this.repoUrl && !this.repoDeleted;
  }
}
