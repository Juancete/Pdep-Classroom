import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Comision } from "./Comision";
import type { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";
import type { Paradigma, TipoAssignment } from "@/types";
import {
  EstadoAssignment,
  type ContextoTransicionEstado,
  type NombreEstadoAssignment,
} from "./EstadoAssignment";

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

export type ParticipantesResueltos =
  | {
      usernames: string[];
      grupoId?: undefined;
      grupoNombreNormalizado?: undefined;
    }
  | {
      usernames: string[];
      grupoId: string;
      grupoNombreNormalizado: string;
    };

// Single Table Inheritance: todos los assignments en una sola tabla,
// discriminados por la columna `tipo`
@Entity({ discriminatorColumn: "tipo", abstract: true })
@Index({ name: "assignment_estado_nombre_index", properties: ["estadoNombre"] })
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

  @ManyToOne(() => Comision, { nullable: true, deleteRule: "cascade" })
  comision?: Comision;

  // Ciclo de vida: borrador (solo admin) → publicado (visible para alumnos)
  // → archivado (histórico, preserva entregas). Ver EstadoAssignment.ts para
  // las reglas de visibilidad y transición — acá solo vive la columna
  // persistida y su resolución al objeto Strategy correspondiente.
  @Enum({ items: ["borrador", "publicado", "archivado"] })
  estadoNombre: NombreEstadoAssignment = "borrador";

  @Property({ nullable: true, type: "datetime" })
  publicadoEn?: Date;

  @Property({ nullable: true, type: "string" })
  publicadoPor?: string;

  @Property({ nullable: true, type: "datetime" })
  archivadoEn?: Date;

  @Property({ nullable: true, type: "string" })
  archivadoPor?: string;

  get estado(): EstadoAssignment {
    return EstadoAssignment.desdeNombre(this.estadoNombre);
  }

  /** `true` si un alumno con o sin entrega debe ver este assignment en su dashboard. */
  esVisibleParaAlumno(tieneEntrega: boolean): boolean {
    return this.estado.esVisibleParaAlumno(tieneEntrega);
  }

  /** `true` si el estado actual habilita aceptar el TP o gestionar grupos. */
  permiteAccionesDeAlumno(): boolean {
    return this.estado.permiteAccionesDeAlumno();
  }

  /**
   * Aplica la transición de estado, validando contra las reglas del estado
   * actual, y sella la auditoría (quién y cuándo publicó/archivó). Lanza
   * `TransicionDeEstadoInvalidaError` si la transición no está permitida.
   */
  transicionarA(
    destino: NombreEstadoAssignment,
    contexto: ContextoTransicionEstado,
    porUsuario: string
  ): void {
    const nuevoEstado = this.estado.transicionarA(this.id, destino, contexto);
    this.estadoNombre = nuevoEstado.nombre;

    if (destino === "publicado") {
      this.publicadoEn = new Date();
      this.publicadoPor = porUsuario;
    }
    if (destino === "archivado") {
      this.archivadoEn = new Date();
      this.archivadoPor = porUsuario;
    }
  }

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

  /**
   * `true` cuando el alumno debe elegir un grupo antes de poder aceptar el TP.
   * Individual: siempre `false`. Grupal: `true` cuando no es admin y no tiene grupo.
   */
  abstract requiereSeleccionDeGrupo(user: { isAdmin: boolean }, grupo: Grupo | null): boolean;

  /**
   * Alumnos del curso que todavía no están en ningún grupo de este assignment.
   * Individual: siempre `[]`. Grupal: filtra `alumnos` excluyendo los que aparecen en algún grupo.
   */
  abstract alumnosSinGrupo(alumnos: Alumno[], grupos: Grupo[]): Alumno[];

  /**
   * Campos extra del formulario de assignment específicos del subtipo.
   * Individual: `{}`. Grupal: `{ maxIntegrantes }`.
   */
  abstract extraFormDefaults(): Partial<{ maxIntegrantes: number }>;

  /**
   * Aplica los campos extra del form al subtipo (inverso de `extraFormDefaults()`).
   * Individual: no-op. Grupal: setea `maxIntegrantes` si viene en `data`.
   * Evita `instanceof GrupalAssignment` en la capa de repositorios.
   */
  abstract aplicarCamposExtra(data: Partial<{ maxIntegrantes: number }>): void;

  /** Nombre del repo template sin el prefijo de organización (ej. "org/repo" → "repo"). */
  nombreDelTemplate(): string {
    return this.templateRepo.includes("/")
      ? this.templateRepo.split("/").pop()!
      : this.templateRepo;
  }

  /**
   * Carga los grupos asociados delegando en `loader`. Individual devuelve `[]`;
   * Grupal invoca `loader(this.id)`. Evita `instanceof GrupalAssignment` en las pages.
   */
  abstract cargarGruposCon(
    loader: (assignmentId: string) => Promise<Grupo[]>
  ): Promise<Grupo[]>;
}
