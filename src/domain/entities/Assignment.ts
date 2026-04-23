import {
  Entity,
  Enum,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Comision } from "./Comision";
import type { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";
import type { Paradigma, TipoAssignment } from "@/types";

// Dependencias de lectura que las subclases pueden usar desde sus métodos
// polimórficos — se pasan como parámetro para que las entidades no importen
// `@/lib/repositories` (mantiene el dominio testeable sin mocks globales).
//
// `getAlumnosDelCurso` es un thunk, no la lista ya cargada: el caller puede
// querer arrancar la query en paralelo con otras y pasarle la misma promise
// para que Individual la reutilice sin disparar un segundo fetch.
export interface FuentesDeConteo {
  getAlumnosDelCurso: () => Promise<Alumno[]>;
  getGruposDeAssignment: (assignmentId: string) => Promise<Grupo[]>;
}

// Lambda con la firma mínima que necesita `GrupalAssignment.resolverParticipantesPara`.
// Individual la ignora. Declararla como tipo evita acoplar la entidad al repo.
export type BuscadorDeGrupoDelAlumno = (
  assignmentId: string,
  githubUsername: string
) => Promise<Grupo | null>;

export interface ParticipantesResueltos {
  usernames: string[];
  grupoId?: string;
}

// Single Table Inheritance: todos los assignments en una sola tabla,
// discriminados por la columna `tipo`
@Entity({ discriminatorColumn: "tipo", abstract: true })
export abstract class Assignment {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: 'string' })
  titulo!: string;

  @Property({ type: 'string' })
  slug!: string;

  @Property({ type: 'string', nullable: true })
  descripcion?: string;

  @Property({ type: 'string' })
  templateRepo!: string;

  @Enum({ items: ["funcional", "logico", "objetos"] })
  paradigma!: Paradigma;

  @Enum({ items: ["individual", "grupal"] })
  tipo!: TipoAssignment;

  @Property({ nullable: true, type: "date" })
  deadline?: Date;

  @Property({ type: 'datetime' })
  createdAt: Date = new Date();

  @ManyToOne(() => Comision, { nullable: true })
  comision?: Comision;

  /** Etiqueta para el contador "totales" del admin (ej: "Alumnos" / "Grupos"). */
  abstract etiquetaTotales(): string;

  /**
   * Cardinalidad del total esperado para el contador del admin. Individual
   * usa el padrón del curso; Grupal usa los grupos del assignment.
   */
  abstract totalEsperado(fuentes: FuentesDeConteo): Promise<number>;

  /**
   * Resuelve a qué github users darles acceso al repo cuando un alumno acepta
   * el assignment. La lambda `buscarGrupoDelAlumno` sólo la usa la variante
   * grupal — individual la ignora. Lanza `GrupoNoAsignadoError` si el alumno
   * no tiene grupo en un assignment grupal.
   */
  abstract resolverParticipantesPara(
    user: { githubUsername: string },
    buscarGrupoDelAlumno: BuscadorDeGrupoDelAlumno
  ): Promise<ParticipantesResueltos>;
}
