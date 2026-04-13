import {
  Collection,
  Entity,
  Enum,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Alumno } from "./Alumno";
import type { GrupalAssignment } from "./GrupalAssignment";
import type { Paradigma } from "@/types";

@Entity()
export class Grupo {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property()
  nombre!: string;

  @Enum({ items: ["funcional", "logico", "objetos"] })
  paradigma!: Paradigma;

  @ManyToMany(() => Alumno)
  alumnos = new Collection<Alumno>(this);

  @Property()
  maxIntegrantes!: number;

  @Property()
  creadoPor!: string;

  @ManyToOne("GrupalAssignment")
  assignment!: GrupalAssignment;

  isOpen(): boolean {
    return this.alumnos.length < this.maxIntegrantes;
  }

  canJoin(alumno: Alumno): boolean {
    return this.isOpen() && !this.alumnos.contains(alumno);
  }

  addMember(alumno: Alumno): void {
    if (!this.canJoin(alumno)) {
      throw new Error(
        this.alumnos.contains(alumno)
          ? `${alumno.githubUsername} ya es miembro del grupo`
          : `El grupo está completo (${this.maxIntegrantes} integrantes)`
      );
    }
    this.alumnos.add(alumno);
  }
}
