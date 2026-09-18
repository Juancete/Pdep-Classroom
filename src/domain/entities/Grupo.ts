import {
  Collection,
  Entity,
  Enum,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Alumno } from "./Alumno";
import { MiembroDeGrupo } from "./MiembroDeGrupo";
import type { GrupalAssignment } from "./GrupalAssignment";
import type { Paradigma, TipoDeIntegrantes } from "@/types";
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
      "El grupo ya aceptó el TP: el repositorio está creado y los cambios de integrantes los tiene que resolver el docente."
    );
    this.name = "GrupoConEntregaError";
  }
}

// Lanzado cuando un participante intenta crearse/unirse/moverse a un grupo
// que no admite su tipo de integrante (issue #107/#112): un alumno no ve ni
// puede unirse a un grupo de docentes, y viceversa. El handler HTTP lo
// traduce a 409, igual que el resto de los conflictos de membresía.
export class GrupoNoAdmiteParticipanteError extends Error {
  constructor(public readonly grupoId: string) {
    super("Este grupo no admite integrantes de este tipo.");
    this.name = "GrupoNoAdmiteParticipanteError";
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

  // Integrantes por username (issue #107/#112): reemplaza el pivot
  // `grupo_alumnos` — `MiembroDeGrupo` referencia por username y, sólo
  // cuando existe, por `Alumno`. `orphanRemoval` porque un `MiembroDeGrupo`
  // no tiene sentido fuera de este grupo (a diferencia del pivot viejo, ya
  // no es una relación many-to-many con `Alumno`).
  @OneToMany("MiembroDeGrupo", "grupo", { orphanRemoval: true })
  miembros = new Collection<MiembroDeGrupo>(this);

  @Property({ type: 'integer' })
  maxIntegrantes!: number;

  @Property({ type: 'string' })
  creadoPor!: string;

  // Quién puede integrar este grupo: "alumnos" (el caso de siempre) o
  // "docentes" (grupo armado para la demo de Mis TPs). Lo fija el creador
  // (`GrupalAssignment.crearGrupo`) y no cambia después. `fieldName`
  // explícito: la convención de nombres derivaría `tipo_de_integrantes`
  // (una palabra más que la columna real `tipo_integrantes`).
  @Property({ type: "string", fieldName: "tipo_integrantes" })
  tipoDeIntegrantes: TipoDeIntegrantes = "alumnos";

  @ManyToOne("GrupalAssignment", { deleteRule: "cascade" })
  assignment!: GrupalAssignment;

  isOpen(): boolean {
    return this.miembros.length < this.maxIntegrantes;
  }

  estaLleno(): boolean {
    return !this.isOpen();
  }

  cantidadMiembros(): number {
    return this.miembros.length;
  }

  etiquetaCupo(): string {
    if (this.estaLleno()) {
      return `Completo (${this.maxIntegrantes}/${this.maxIntegrantes})`;
    }
    return `${this.cantidadMiembros()}/${this.maxIntegrantes} integrantes`;
  }

  contieneA(githubUsername: string): boolean {
    return this.miembroConUsername(githubUsername) !== undefined;
  }

  miembroConUsername(githubUsername: string): MiembroDeGrupo | undefined {
    const canonico = Alumno.normalizarUsername(githubUsername);
    return this.miembros
      .getItems()
      .find((miembro) => Alumno.normalizarUsername(miembro.githubUsername) === canonico);
  }

  estaVacio(): boolean {
    return this.miembros.length === 0;
  }

  usernamesDeMiembros(): string[] {
    return this.miembros.getItems().map((miembro) => miembro.githubUsername);
  }

  usernamesCanonicos(): string[] {
    return this.miembros
      .getItems()
      .map((miembro) => Alumno.normalizarUsername(miembro.githubUsername));
  }

  /**
   * `true` si este grupo puede recibir integrantes del tipo indicado — un
   * grupo de alumnos no admite a un docente ni viceversa (issue #107/#112):
   * son cupos y selectores completamente separados.
   */
  admiteIntegrantesDe(tipoDeIntegrantes: TipoDeIntegrantes): boolean {
    return this.tipoDeIntegrantes === tipoDeIntegrantes;
  }

  /** Un grupo de alumnos sólo integra alumnos registrados; uno de docentes admite miembros sin fila. */
  exigeVinculoConAlumno(): boolean {
    return this.tipoDeIntegrantes === "alumnos";
  }

  /**
   * Predicción usada por la UI ANTES de que `githubUsername` confirme salir
   * del grupo: `true` si es el único integrante que queda (con lo cual
   * salir lo dejaría vacío). Complementa `seEliminaAlSalir`, que evalúa
   * DESPUÉS de `quitarMiembro` — dos métodos porque la UI necesita predecir
   * sin mutar el grupo sólo para previsualizar, mientras que el
   * repositorio evalúa sobre el estado ya actualizado (Fase 3 de la
   * auditoría de dominio).
   */
  quedaraVacioSiSale(githubUsername: string): boolean {
    return this.cantidadMiembros() === 1 && this.contieneA(githubUsername);
  }

  /**
   * `true` si, luego de remover a un integrante (`quitarMiembro`), el grupo
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
   * byte a byte (Fase 3 de la auditoría de dominio). Suma `tipoDeIntegrantes`
   * para que el panel admin pueda distinguir un grupo de docentes.
   */
  toResumen(): {
    id: string;
    nombre: string;
    paradigma: Paradigma;
    maxIntegrantes: number;
    estaLleno: boolean;
    miembros: string[];
    tipoDeIntegrantes: TipoDeIntegrantes;
  } {
    return {
      id: this.id,
      nombre: this.nombre,
      paradigma: this.paradigma,
      maxIntegrantes: this.maxIntegrantes,
      estaLleno: this.estaLleno(),
      miembros: this.usernamesDeMiembros(),
      tipoDeIntegrantes: this.tipoDeIntegrantes,
    };
  }

  /**
   * Suma un integrante nuevo, identificado por su username de GitHub —
   * `alumno` es opcional: un docente armando un grupo de demo no tiene
   * fila en `Alumno`, y el vínculo queda sin completar. Lanza si ya es
   * miembro o si el grupo está lleno (`GrupoLlenoError`).
   */
  agregarMiembro(githubUsername: string, alumno: Alumno | null): MiembroDeGrupo {
    const canonico = Alumno.normalizarUsername(githubUsername);
    if (this.contieneA(canonico)) {
      throw new Error(`${githubUsername} ya es miembro del grupo`);
    }
    if (!this.isOpen()) {
      throw new GrupoLlenoError(this.id, this.maxIntegrantes);
    }
    const miembro = new MiembroDeGrupo();
    miembro.grupo = this;
    miembro.assignmentId = this.assignment.id;
    miembro.githubUsername = canonico;
    if (alumno) miembro.alumno = alumno;
    this.miembros.add(miembro);
    return miembro;
  }

  quitarMiembro(githubUsername: string): void {
    const miembro = this.miembroConUsername(githubUsername);
    if (!miembro) {
      throw new AlumnoNoEsMiembroDelGrupoError(this.id, githubUsername);
    }
    this.miembros.remove(miembro);
  }
}
