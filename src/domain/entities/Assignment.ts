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
import type { GrupalAssignment } from "./GrupalAssignment";
import type { Paradigma, TipoAssignment } from "@/types";
import { PARADIGMAS, TIPOS_ASSIGNMENT } from "./domain-constants";
import {
  EstadoAssignment,
  type ContextoTransicionEstado,
  type NombreEstadoAssignment,
} from "./EstadoAssignment";
import type { RolDeUsuario } from "./RolDeUsuario";
import { slugify } from "@/lib/naming";

// Dependencias de lectura que las subclases pueden usar desde sus métodos
// polimórficos — se pasan como parámetro para que las entidades no importen
// `@/infrastructure/repositories` (mantiene el dominio testeable sin mocks globales).
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

// Subconjunto estructural de `AssignmentFormData` (lib/assignment-schema.ts)
// que puede tocar `actualizarEstructura` — se declara acá en vez de
// importar ese tipo para no acoplar la entidad a la capa de formularios/zod
// (mismo criterio que `FuentesDeConteo` con `@/infrastructure/repositories`).
export interface DatosEstructurales {
  tipo?: TipoAssignment;
  titulo?: string;
  slug?: string;
  descripcion?: string;
  templateRepo?: string;
  // `string`, no `Paradigma`: viene de `AssignmentFormData` (zod), cuyo
  // `z.enum` no preserva el literal union sin acoplar el schema al tipo de
  // dominio. Se castea al asignar, igual que hacía el repositorio antes.
  paradigma?: string;
  deadline?: string;
  maxIntegrantes?: number;
}

// Errores de dominio sobre la existencia/disponibilidad de un assignment.
// Viven acá (no en la capa de aplicación) para que los repositorios puedan
// lanzarlos sin importar hacia arriba desde `@/application`.
export class AssignmentNoEncontradoError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Assignment no encontrado");
    this.name = "AssignmentNoEncontradoError";
  }
}

export class AssignmentNoDisponibleError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Este TP no está disponible.");
    this.name = "AssignmentNoDisponibleError";
  }
}

// Vivía en `Grupo.ts` (y se reexporta desde ahí para no romper imports
// existentes), pero es un error sobre `Assignment` — lo lanza
// `Assignment.exigirGrupal()` cuando el subtipo concreto no es
// `GrupalAssignment`. No puede importar `GrupalAssignment` en runtime acá
// (ciclo de módulos: `Assignment.ts` → `GrupalAssignment.ts` →
// `Assignment.ts` rompe con "Class extends value undefined"), así que vive
// junto al resto de los errores de `Assignment`.
export class AssignmentNoGrupalError extends Error {
  constructor(public readonly assignmentId: string) {
    super("Este TP no es grupal.");
    this.name = "AssignmentNoGrupalError";
  }
}

// Fase 3 de la auditoría de dominio: vivían en `AssignmentRepository.ts`
// contra el mismo criterio documentado en `AssignmentNoEliminableError` más
// abajo — los errores de dominio de `Assignment` van acá.
export class ComisionActivaRequeridaError extends Error {
  constructor() {
    super("Necesitás una comisión activa para crear assignments.");
    this.name = "ComisionActivaRequeridaError";
  }
}

export class AssignmentEstructuraInmutableError extends Error {
  constructor(public readonly campos: string[]) {
    super(
      `No se puede cambiar ${campos.join(", ")} en un assignment publicado o archivado.`
    );
    this.name = "AssignmentEstructuraInmutableError";
  }
}

export class AssignmentTipoInmutableError extends AssignmentEstructuraInmutableError {
  constructor() {
    super(["el tipo"]);
    this.message = "El tipo de un assignment no se puede cambiar después de crearlo.";
    this.name = "AssignmentTipoInmutableError";
  }
}

// Motivo por el que un assignment no puede borrarse físicamente — mismo
// orden de prioridad que `Assignment.razonNoEliminable`: primero el estado,
// después entregas, después grupos.
export type MotivoNoEliminable = "estado" | "entregas" | "grupos";

// B4 de la auditoría de dominio: vivía en `AssignmentRepository.ts` contra el
// criterio documentado más abajo — los errores de dominio de `Assignment`
// van acá, no en el repositorio, para que la UI y el repo puedan compartir
// la misma regla (`puedeEliminarse`) sin duplicar el mensaje.
export class AssignmentNoEliminableError extends Error {
  constructor(public readonly motivo: MotivoNoEliminable) {
    const mensajes: Record<MotivoNoEliminable, string> = {
      estado: "Sólo se pueden eliminar assignments que todavía están en borrador.",
      entregas: "El assignment tiene entregas y debe conservarse como histórico. Archivá el TP en lugar de eliminarlo.",
      grupos: "El assignment tiene grupos asociados y debe conservarse como histórico.",
    };
    super(mensajes[motivo]);
    this.name = "AssignmentNoEliminableError";
  }
}

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

  @Enum({ items: [...PARADIGMAS] })
  paradigma!: Paradigma;

  @Enum({ items: [...TIPOS_ASSIGNMENT] })
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
   * `true` si el estado actual habilita el borrado masivo de repos de
   * GitHub de las entregas (Fase 3 de la auditoría de dominio) — antes
   * `estadoNombre === "archivado"` se repetía suelto en 3 lugares.
   */
  permiteBorrarRepos(): boolean {
    return this.estado.permiteBorrarRepos();
  }

  /** `true` si el estado actual habilita editar campos estructurales. */
  permiteEditarEstructura(): boolean {
    return this.estado.permiteEditarEstructura();
  }

  /**
   * `true` si en este estado ya pudo haber alumnos aceptando el TP —
   * tiene sentido contar pendientes/aceptadas (Publicado y Archivado). Ver
   * `EstadoAssignment.esperaEntregas` para la distinción con
   * `permiteEditarEstructura`.
   */
  esperaEntregas(): boolean {
    return this.estado.esperaEntregas();
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
    const estadoAnterior = this.estadoNombre;
    const nuevoEstado = this.estado.transicionarA(this.id, destino, contexto);
    this.estadoNombre = nuevoEstado.nombre;

    // Pedir de nuevo el mismo estado (ej. "publicar" un TP ya publicado) es un
    // no-op: no resella la auditoría, para no pisar quién y cuándo lo publicó
    // o archivó realmente con el usuario que hizo el click redundante.
    if (nuevoEstado.nombre === estadoAnterior) return;

    if (nuevoEstado.nombre === "publicado") {
      this.publicadoEn = new Date();
      this.publicadoPor = porUsuario;
    }
    if (nuevoEstado.nombre === "archivado") {
      this.archivadoEn = new Date();
      this.archivadoPor = porUsuario;
    }
  }

  /**
   * Motivo por el que este assignment no puede borrarse físicamente, o
   * `null` si sí puede. Única fuente para `AssignmentRepository.deleteAssignment`
   * (que la usa para decidir si lanza `AssignmentNoEliminableError`) y para
   * el botón de borrado del panel admin (B4 de la auditoría de dominio) —
   * antes divergían: el server exigía además "0 grupos" y la UI sólo
   * chequeaba estado + entregas, así que ofrecía un borrado que el server
   * rechazaba.
   */
  razonNoEliminable(contexto: { tieneEntregas: boolean; tieneGrupos: boolean }): MotivoNoEliminable | null {
    if (!this.estado.permiteEliminacion()) return "estado";
    if (contexto.tieneEntregas) return "entregas";
    if (contexto.tieneGrupos) return "grupos";
    return null;
  }

  /** `true` si este assignment puede borrarse físicamente dado el contexto. */
  puedeEliminarse(contexto: { tieneEntregas: boolean; tieneGrupos: boolean }): boolean {
    return this.razonNoEliminable(contexto) === null;
  }

  /**
   * Aplica cambios del formulario de edición, validando la inmutabilidad
   * estructural del estado actual (Fase 3 de la auditoría de dominio —
   * antes vivía en `AssignmentRepository.updateAssignment` con un
   * `instanceof GrupalAssignment` para `maxIntegrantes`).
   *
   * El tipo nunca puede cambiar, en ningún estado — sólo difiere el error:
   * `AssignmentTipoInmutableError` (mensaje específico) si todavía está en
   * borrador, o el genérico si ya no lo está. El resto de los campos
   * estructurales (slug, template, paradigma, y los que agregue el subtipo
   * vía `camposEstructuralesQueCambian`) sólo pueden cambiar en borrador;
   * título/descripción/deadline se pueden editar en cualquier estado.
   */
  actualizarEstructura(data: DatosEstructurales): void {
    if (data.tipo !== undefined && data.tipo !== this.tipo) {
      if (this.estado.permiteEditarEstructura()) {
        throw new AssignmentTipoInmutableError();
      }
      throw new AssignmentEstructuraInmutableError(["el tipo"]);
    }

    if (!this.estado.permiteEditarEstructura()) {
      const slugResuelto =
        data.slug === undefined
          ? this.slug
          : data.slug || slugify(data.titulo ?? this.titulo);

      const campos: string[] = [];
      if (slugResuelto !== this.slug) campos.push("el slug");
      if (data.templateRepo !== undefined && data.templateRepo !== this.templateRepo) {
        campos.push("el template");
      }
      if (data.paradigma !== undefined && data.paradigma !== this.paradigma) {
        campos.push("el paradigma");
      }
      campos.push(...this.camposEstructuralesQueCambian(data));
      if (campos.length > 0) throw new AssignmentEstructuraInmutableError(campos);
    }

    if (data.titulo !== undefined) this.titulo = data.titulo;
    if (data.slug !== undefined) this.slug = data.slug || slugify(data.titulo ?? this.titulo);
    if (data.descripcion !== undefined) this.descripcion = data.descripcion;
    if (data.templateRepo !== undefined) this.templateRepo = data.templateRepo;
    if (data.paradigma !== undefined) this.paradigma = data.paradigma as Paradigma;
    if (data.deadline !== undefined) {
      this.deadline = data.deadline ? new Date(data.deadline) : undefined;
    }

    this.aplicarCamposExtra(data);
  }

  /**
   * Campos estructurales adicionales (más allá de slug/template/paradigma,
   * comunes a todo assignment) que cambiarían si se aplicara `data` — hoy
   * sólo `GrupalAssignment` define alguno (`maxIntegrantes`). Reemplaza el
   * `instanceof GrupalAssignment` que tenía `AssignmentRepository.updateAssignment`.
   */
  protected camposEstructuralesQueCambian(_data: DatosEstructurales): string[] {
    return [];
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
   * grupal — individual la ignora. `alumno` (el registro de `Alumno`, o
   * `null` si todavía no se registró) sólo lo usa la variante individual,
   * para exigir el registro antes de aceptar (`AlumnoNoRegistradoError`) —
   * en grupal la falta de registro no aplica igual, la resuelve
   * `GrupoNoAsignadoError` si no tiene grupo. Antes este chequeo vivía como
   * `if (!grupoId && !alumno)` en `aceptarAssignment.ts`, un branch por
   * tipo fuera del dominio (Fase 3 de la auditoría de dominio).
   */
  abstract resolverParticipantesPara(
    user: { githubUsername: string },
    buscarGrupoDelAlumno: BuscadorDeGrupoDelAlumno,
    alumno: Alumno | null
  ): Promise<ParticipantesResueltos>;

  /**
   * Nombre del repo de GitHub para estos participantes — Individual usa el
   * username del alumno; Grupal usa el nombre normalizado del grupo (y
   * exige que `resolverParticipantesPara` lo haya resuelto). Reemplaza la
   * rama `grupoId ? buildRepoName({..grupoNombreNormalizado}) : buildRepoName({..githubUsername})`
   * que vivía en `aceptarAssignment.ts` (Fase 3 de la auditoría de dominio).
   */
  abstract nombreDeRepoPara(participantes: ParticipantesResueltos): string;

  /**
   * `true` cuando el alumno debe elegir un grupo antes de poder aceptar el TP.
   * Individual: siempre `false`. Grupal: `true` cuando no es admin y no tiene grupo.
   */
  abstract requiereSeleccionDeGrupo(user: { rol: RolDeUsuario }, grupo: Grupo | null): boolean;

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

  /**
   * Narrowing polimórfico al subtipo concreto: `GrupalAssignment` devuelve
   * `this`, `IndividualAssignment` devuelve `null`. Reemplaza
   * `instanceof GrupalAssignment` en los bordes (pages/repositorios) que
   * necesitan acceder a miembros específicos de `GrupalAssignment`
   * (`maxIntegrantes`, `inscripcionesCerradas`, `crearGrupo`, etc.) sin que
   * el dominio ramifique por tipo fuera de sus propios métodos
   * polimórficos.
   */
  abstract comoGrupal(): GrupalAssignment | null;

  /**
   * Igual que `comoGrupal()`, pero para los bordes que ya asumen que el
   * assignment es grupal y prefieren fallar con un error de dominio
   * (`AssignmentNoGrupalError`) en vez de manejar `null` — reemplaza el
   * patrón `if (!(assignment instanceof GrupalAssignment)) throw ...`.
   */
  exigirGrupal(): GrupalAssignment {
    const grupal = this.comoGrupal();
    if (!grupal) throw new AssignmentNoGrupalError(this.id);
    return grupal;
  }
}
