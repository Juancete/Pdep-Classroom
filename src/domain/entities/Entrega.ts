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
  ResultadoCI,
  NOMBRES_RESULTADO_CI,
  type NombreResultadoCI,
} from "./ResultadoCI";

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

  // CI (issue #58): estado combinado de los checks del último commit del
  // branch por defecto del repo de esta entrega — mismo mecanismo que un
  // badge de CI en un README, no depende de un workflow con nombre fijo.
  // Sólo se guarda el último resultado — no un historial completo (ver
  // `RepoDeletionAttempt` para el molde de auditoría si más adelante hace
  // falta la serie completa).
  @Enum({ items: [...NOMBRES_RESULTADO_CI], default: "sin_consultar" })
  ciResultadoNombre: NombreResultadoCI = "sin_consultar";

  // Check suites del último commit consultado — se usan para pedir el
  // rerequest al reejecutar. Pueden ser varios si el repo tiene más de un
  // workflow (ej. lint + tests).
  @Property({ type: "array", defaultRaw: "'{}'" })
  ciCheckSuiteIds: string[] = [];

  @Property({ type: 'string', nullable: true })
  ciCommitSha?: string;

  // Link a la pestaña de checks del commit en GitHub (agrega todos los
  // checks, no uno solo).
  @Property({ type: 'string', nullable: true })
  ciDetalleUrl?: string;

  @Property({ type: 'datetime', nullable: true })
  ciEjecutadoEn?: Date; // cuándo corrieron los checks (según GitHub)

  @Property({ type: 'datetime', nullable: true })
  ciActualizadoEn?: Date; // cuándo los consultamos nosotros (frescura del caché)

  // Actividad reciente del repo (issue #60) — la escribe el webhook de
  // `push` cuando llega un commit nuevo al branch por defecto.
  @Property({ type: 'datetime', nullable: true })
  ultimoPushEn?: Date;

  @Property({ type: 'string', nullable: true })
  ultimoPushSha?: string;

  @Property({ type: 'string', nullable: true })
  ultimoPushPor?: string; // sender.login del payload de GitHub

  // Id numérico de GitHub del repo (issue #60) — a diferencia de `repoName`,
  // no cambia con un rename. Resolver los eventos `repository.deleted`/
  // `renamed` por acá (en vez de por nombre) evita perderlos cuando GitHub
  // entrega los webhooks desordenados: un `renamed` A→B procesado después
  // de un `renamed` B→C ya aplicado seguiría encontrando la entrega por id,
  // aunque el nombre actual ya no coincida con lo que ese evento espera. Se
  // autocompleta ("self-heal") la primera vez que llega cualquier webhook
  // para el repo — no hace falta poblarlo al crear la entrega.
  @Property({ type: 'string', nullable: true, unique: true })
  repoGithubId?: string;

  // `repository.updated_at` del último evento `repository` aplicado — guard
  // de orden: un `deleted`/`renamed` viejo que llega tarde no debe pisar uno
  // más nuevo ya aplicado (GitHub no garantiza el orden de entrega).
  @Property({ type: 'datetime', nullable: true })
  repoEventoActualizadoEn?: Date;

  get resultadoCI(): ResultadoCI {
    return ResultadoCI.desdeNombre(this.ciResultadoNombre);
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
