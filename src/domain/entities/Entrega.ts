import {
  Entity,
  Enum,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Alumno } from "./Alumno";
import { Assignment } from "./Assignment";
import { Grupo } from "./Grupo";
import {
  ResultadoAutograding,
  NOMBRES_RESULTADO_AUTOGRADING,
  type NombreResultadoAutograding,
} from "./ResultadoAutograding";

@Entity()
export class Entrega {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne(() => Assignment, { deleteRule: "cascade" })
  assignment!: Assignment;

  // Individual: alumno que entrega
  @ManyToOne(() => Alumno, { nullable: true })
  alumno?: Alumno;

  // Grupal: grupo al que pertenece la entrega. `deleteRule: "set null"`
  // explícito (era el default implícito de MikroORM para un `@ManyToOne`
  // nullable, ya vigente en la base) — un grupo puede borrarse sin arrastrar
  // la entrega: el registro histórico se preserva con `grupo` en null.
  @ManyToOne(() => Grupo, { nullable: true, deleteRule: "set null" })
  grupo?: Grupo;

  // Todos los usernames con acceso al repo (denormalizado para queries rápidas)
  @Property({ type: "array" })
  githubUsernames: string[] = [];

  @Property({ type: 'string', nullable: true })
  repoName?: string;

  @Property({ type: 'string', nullable: true })
  repoUrl?: string;

  @Property({ type: 'boolean', default: false })
  repoDeleted: boolean = false;

  @Property({ type: 'datetime' })
  createdAt: Date = new Date();

  // Autograding (issue #58): resultado de la última ejecución consultada del
  // workflow `.github/workflows/autograding.yml` en el repo de esta entrega.
  // Sólo se guarda la última — no un historial completo (ver
  // `RepoDeletionAttempt` para el molde de auditoría si más adelante hace
  // falta la serie completa).
  @Enum({ items: [...NOMBRES_RESULTADO_AUTOGRADING], default: "sin_consultar" })
  autogradingResultadoNombre: NombreResultadoAutograding = "sin_consultar";

  @Property({ type: 'string', nullable: true })
  autogradingRunId?: string; // el id de GitHub es bigint: se guarda como string

  @Property({ type: 'string', nullable: true })
  autogradingRunUrl?: string;

  @Property({ type: 'string', nullable: true })
  autogradingCommitSha?: string;

  @Property({ type: 'datetime', nullable: true })
  autogradingEjecutadoEn?: Date; // cuándo corrió la run (según GitHub)

  @Property({ type: 'datetime', nullable: true })
  autogradingActualizadoEn?: Date; // cuándo la consultamos nosotros (frescura del caché)

  get resultadoAutograding(): ResultadoAutograding {
    return ResultadoAutograding.desdeNombre(this.autogradingResultadoNombre);
  }

  hasRepo(): boolean {
    return !!this.repoUrl && !this.repoDeleted;
  }

  repoFueBorrado(): boolean {
    return !!this.repoName && this.repoDeleted;
  }

  noTieneRepo(): boolean {
    return !this.repoName;
  }

  estadoRepo(): "borrado" | "activo" | "sin-repo" {
    if (this.repoFueBorrado()) return "borrado";
    if (this.hasRepo()) return "activo";
    return "sin-repo";
  }
}
