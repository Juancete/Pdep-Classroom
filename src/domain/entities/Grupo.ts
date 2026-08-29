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
import { PARADIGMAS } from "./domain-constants";

// Reexportado para no romper imports existentes: el error es sobre
// `Assignment` (lo lanza `Assignment.exigirGrupal()`), así que ahora vive
// en `Assignment.ts` junto al resto de sus errores de dominio.
export { AssignmentNoGrupalError } from "./Assignment";

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

export class GrupoNoEncontradoError extends Error {
  constructor(
    public readonly assignmentId: string,
    public readonly grupoId: string
  ) {
    super("Grupo no encontrado");
    this.name = "GrupoNoEncontradoError";
  }
}

// Errores de negocio de la administración de integrantes (issue #50):
// salir, cambiarse y moverse entre grupos.

export class AlumnoNoEsMiembroDelGrupoError extends Error {
  constructor(
    public readonly grupoId: string,
    public readonly githubUsername: string
  ) {
    super(`@${githubUsername} no es integrante de este grupo.`);
    this.name = "AlumnoNoEsMiembroDelGrupoError";
  }
}

export class GrupoConEntregaError extends Error {
  constructor(public readonly grupoId: string) {
    super(
      "El grupo ya entregó: el repositorio está creado y los cambios de integrantes los tiene que resolver el docente."
    );
    this.name = "GrupoConEntregaError";
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

  @Enum({ items: [...PARADIGMAS] })
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

  miembroConUsername(githubUsername: string): Alumno | undefined {
    const canonico = Alumno.normalizarUsername(githubUsername);
    return this.alumnos
      .getItems()
      .find((alumno) => alumno.usernameCanonico === canonico);
  }

  estaVacio(): boolean {
    return this.alumnos.length === 0;
  }

  usernamesDeMiembros(): string[] {
    return this.alumnos.getItems().map((alumno) => alumno.githubUsername);
  }

  usernamesCanonicos(): string[] {
    return this.alumnos.getItems().map((alumno) => alumno.usernameCanonico);
  }

  /**
   * Predicción usada por la UI ANTES de que `githubUsername` confirme salir
   * del grupo: `true` si es el único integrante que queda (con lo cual
   * salir lo dejaría vacío). Complementa `seEliminaAlSalir`, que evalúa
   * DESPUÉS de `removeMember` — dos métodos porque la UI necesita predecir
   * sin mutar el grupo sólo para previsualizar, mientras que el
   * repositorio evalúa sobre el estado ya actualizado (Fase 3 de la
   * auditoría de dominio).
   */
  quedaraVacioSiSale(githubUsername: string): boolean {
    return this.cantidadMiembros() === 1 && this.contieneA(githubUsername);
  }

  /**
   * `true` si, luego de remover a un integrante (`removeMember`), el grupo
   * debe eliminarse: quedó vacío y no tiene entrega asociada — un grupo con
   * entrega se preserva como registro histórico aunque quede sin
   * integrantes. Ver `quedaraVacioSiSale` para la predicción previa que usa
   * la UI antes de remover.
   */
  seEliminaAlSalir(tieneEntrega: boolean): boolean {
    return this.estaVacio() && !tieneEntrega;
  }

  /**
   * Resumen plano para las routes de grupos (`api/assignments/[id]/grupos/**`)
   * — las tres tenían la misma función `serializarGrupo` duplicada
   * byte a byte (Fase 3 de la auditoría de dominio).
   */
  toResumen(): {
    id: string;
    nombre: string;
    paradigma: Paradigma;
    maxIntegrantes: number;
    estaLleno: boolean;
    miembros: string[];
  } {
    return {
      id: this.id,
      nombre: this.nombre,
      paradigma: this.paradigma,
      maxIntegrantes: this.maxIntegrantes,
      estaLleno: this.estaLleno(),
      miembros: this.usernamesDeMiembros(),
    };
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

  removeMember(alumno: Alumno): void {
    if (!this.alumnos.contains(alumno)) {
      throw new AlumnoNoEsMiembroDelGrupoError(this.id, alumno.githubUsername);
    }
    this.alumnos.remove(alumno);
  }
}
