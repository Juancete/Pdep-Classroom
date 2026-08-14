import {
  Collection,
  Entity,
  Enum,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Alumno } from "./Alumno";
import type { GrupalAssignment } from "./GrupalAssignment";
import type { Paradigma } from "@/types";

// Errores de negocio del flujo self-serve de inscripción a grupos. El handler
// HTTP los traduce a 400/409 con mensajes amigables. Análogos a
// `GrupoNoAsignadoError`: tipados para que el caller pueda discriminar.

export class InscripcionesCerradasError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Las inscripciones a grupos están cerradas para este TP.");
    this.name = "InscripcionesCerradasError";
  }
}

export class AlumnoYaEnGrupoDelAssignmentError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly githubUsername: string
  ) {
    super("Ya estás en un grupo para este TP.");
    this.name = "AlumnoYaEnGrupoDelAssignmentError";
  }
}

export class NombreGrupoDuplicadoError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly nombre: string
  ) {
    super(
      `Ya existe un grupo con el mismo nombre o identificador normalizado que "${nombre}" para este TP.`
    );
    this.name = "NombreGrupoDuplicadoError";
  }
}

export class NombreGrupoInvalidoError extends Error {
  constructor(public readonly nombre: string) {
    super("El nombre del grupo debe incluir al menos una letra o un número.");
    this.name = "NombreGrupoInvalidoError";
  }
}

export class GrupoLlenoError extends Error {
  constructor(
    public readonly grupoId: string,
    public readonly maxIntegrantes: number
  ) {
    super(`El grupo está completo (${maxIntegrantes} integrantes).`);
    this.name = "GrupoLlenoError";
  }
}

export class AssignmentNoGrupalError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Este TP no es grupal.");
    this.name = "AssignmentNoGrupalError";
  }
}

@Entity()
@Unique({
  name: "grupo_id_assignment_unique",
  properties: ["id", "assignment"],
})
@Unique({
  name: "grupo_assignment_nombre_normalizado_unique_idx",
  properties: ["assignment", "nombreNormalizado"],
})
export class Grupo {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: 'string' })
  nombre!: string;

  @Property({ type: "string" })
  nombreNormalizado!: string;

  @Enum({ items: ["funcional", "logico", "objetos"] })
  paradigma!: Paradigma;

  @ManyToMany({ entity: () => Alumno, pivotTable: "grupo_alumnos" })
  alumnos = new Collection<Alumno>(this);

  @Property({ type: 'integer' })
  maxIntegrantes!: number;

  @Property({ type: 'string' })
  creadoPor!: string;

  @ManyToOne("GrupalAssignment", { deleteRule: "cascade" })
  assignment!: GrupalAssignment;

  isOpen(): boolean {
    return this.alumnos.length < this.maxIntegrantes;
  }

  estaLleno(): boolean {
    return !this.isOpen();
  }

  cantidadMiembros(): number {
    return this.alumnos.length;
  }

  etiquetaCupo(): string {
    if (this.estaLleno()) {
      return `Completo (${this.maxIntegrantes}/${this.maxIntegrantes})`;
    }
    return `${this.cantidadMiembros()}/${this.maxIntegrantes} integrantes`;
  }

  contieneA(githubUsername: string): boolean {
    const canonico = Alumno.normalizarUsername(githubUsername);
    return this.alumnos
      .getItems()
      .some((alumno) => alumno.usernameCanonico === canonico);
  }

  usernamesDeMiembros(): string[] {
    return this.alumnos.getItems().map((alumno) => alumno.githubUsername);
  }

  usernamesCanonicos(): string[] {
    return this.alumnos.getItems().map((alumno) => alumno.usernameCanonico);
  }

  canJoin(alumno: Alumno): boolean {
    return this.isOpen() && !this.alumnos.contains(alumno);
  }

  addMember(alumno: Alumno): void {
    if (this.alumnos.contains(alumno)) {
      throw new Error(`${alumno.githubUsername} ya es miembro del grupo`);
    }
    if (!this.isOpen()) {
      throw new GrupoLlenoError(this.id, this.maxIntegrantes);
    }
    this.alumnos.add(alumno);
  }
}
